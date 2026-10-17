-- Storage buckets, platform administration and final privilege hardening.

-- ---------------------------------------------------------------------------
-- Storage
--   listing-media: listing photos. Private bucket; readable by anyone only once the
--                  listing is published, and always by the listing's staff.
--                  Path: {org_id}/{listing_id}/{file}
--   private-docs:  payment evidence and tenancy documents. Never public.
--                  Path: {org_id}/{property_id}/{entry_id}/{file}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-media', 'listing-media', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('private-docs', 'private-docs', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.safe_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function app.can_read_listing_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listing_photos ph join public.listings l on l.id = ph.listing_id
    where (ph.storage_path = p_name or ph.thumb_path = p_name)
      and (l.status = 'published' or app.can(l.property_id, 'manage_listings') or app.is_platform_admin()))
$$;

create or replace function app.can_write_listing_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listings l
    where l.id = app.safe_uuid((storage.foldername(p_name))[2])
      and l.org_id = app.safe_uuid((storage.foldername(p_name))[1])
      and app.can(l.property_id, 'manage_listings'))
$$;

create or replace function app.can_read_private_doc(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attachments a
    where a.storage_path = p_name and a.removed_at is null
      and (app.can(a.property_id, 'view_attachments') or a.uploaded_by = auth.uid()))
$$;

create or replace function app.can_write_private_doc(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payment_entries e
    where e.id = app.safe_uuid((storage.foldername(p_name))[3])
      and e.property_id = app.safe_uuid((storage.foldername(p_name))[2])
      and e.org_id = app.safe_uuid((storage.foldername(p_name))[1])
      and e.status in ('draft', 'returned', 'awaiting_confirmation')
      and app.can(e.property_id, 'enter_payments'))
$$;

grant execute on function app.safe_uuid(text), app.can_read_listing_object(text),
  app.can_write_listing_object(text), app.can_read_private_doc(text), app.can_write_private_doc(text)
  to anon, authenticated;

-- Staff of the listing can always read its folder (needed while uploading, before the
-- listing_photos row exists); everyone else only once the listing is published.
create policy listing_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'listing-media' and (app.can_read_listing_object(name) or app.can_write_listing_object(name)));
create policy listing_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-media' and app.can_write_listing_object(name));
create policy listing_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'listing-media' and app.can_write_listing_object(name));

create policy private_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'private-docs' and (app.can_read_private_doc(name)
         or (owner_id = auth.uid()::text and app.can_write_private_doc(name))));
create policy private_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'private-docs' and app.can_write_private_doc(name));

-- ---------------------------------------------------------------------------
-- Platform administration. Admins handle onboarding, listing review, reports and delivery
-- failures. They have no routine access to rent records.
-- ---------------------------------------------------------------------------

create or replace function app.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    perform app.raise_error('forbidden', 'Platform administrators only.');
  end if;
end $$;

create or replace function public.admin_queue_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return jsonb_build_object(
    'onboarding', (select count(*) from public.organizations where onboarding_status in ('new', 'in_review', 'changes_needed')),
    'listing_review', (select count(*) from public.listings where status = 'under_review'),
    'listing_reports', (select count(*) from public.listing_reports where status in ('open', 'reviewing')),
    'delivery_failures', (select count(*) from public.delivery_tasks where status = 'failed'),
    'delivery_queued', (select count(*) from public.delivery_tasks where status = 'queued'),
    'oldest_review_hours', (select extract(epoch from now() - min(submitted_at)) / 3600 from public.listings where status = 'under_review'),
    'submitted_today', (select count(*) from public.listings where submitted_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'published_today', (select count(*) from public.listings where published_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'sent_back', (select count(*) from public.listings where status = 'needs_correction')
  );
end $$;

create or replace function public.admin_review_queue()
returns table (id uuid, ref text, title text, rent_amount numeric, price_basis text, area text, status text,
  flags jsonb, submitted_at timestamptz, org_id uuid, org_name text, advertiser_role text,
  identity_checked_at date, authority_checked_at date, photo_count int, totals_complete boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
  select l.id, l.ref, l.title, l.rent_amount, l.price_basis, p.area, l.status, l.flags, l.submitted_at,
    o.id, o.name, o.advertiser_role, o.identity_checked_at, o.authority_checked_at,
    (select count(*)::int from public.listing_photos ph where ph.listing_id = l.id), l.totals_complete
  from public.listings l join public.properties p on p.id = l.property_id
  join public.organizations o on o.id = l.org_id
  where l.status = 'under_review'
  order by l.submitted_at;
end $$;

create or replace function public.admin_review_listing(p_listing uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings;
begin
  perform app.require_admin();
  select * into v_l from public.listings where id = p_listing for update;
  if v_l.id is null then perform app.raise_error('not_found', 'Listing not found.'); end if;
  if v_l.status <> 'under_review' then perform app.raise_error('validation', 'This listing is not waiting for review.'); end if;
  if p_decision not in ('publish', 'needs_correction') then perform app.raise_error('validation', 'Unknown decision.'); end if;
  if p_decision = 'needs_correction' and length(trim(coalesce(p_note, ''))) < 3 then
    perform app.raise_error('reason_required', 'Tell the advertiser exactly what to correct.');
  end if;
  update public.listings set status = case when p_decision = 'publish' then 'published' else 'needs_correction' end,
    review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now(),
    published_at = case when p_decision = 'publish' then coalesce(published_at, now()) else published_at end
  where id = p_listing;
  perform app.audit(v_l.org_id, v_l.property_id, 'listing_reviewed', 'listing', p_listing::text,
    jsonb_build_object('decision', p_decision, 'note', p_note));
  perform app.notify_advertiser_team(v_l.property_id, v_l.org_id, 'listing_reviewed:' || p_listing || ':' || extract(epoch from now()),
    'listing_reviewed',
    case when p_decision = 'publish' then 'Listing published' else 'Listing needs a correction' end,
    coalesce(v_l.title, v_l.ref) || coalesce(': ' || nullif(trim(p_note), ''), ''),
    '/w/' || v_l.org_id || '/listings/' || p_listing);
end $$;

create or replace function public.admin_onboarding_queue()
returns table (org_id uuid, name text, kind text, advertiser_role text, onboarding_status text,
  onboarding_note text, assignee_name text, assignee_id uuid, created_at timestamptz, owner_name text,
  owner_email text, owner_phone text, identity_checked_at date, authority_checked_at date,
  property_count int, listing_count int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
  select o.id, o.name, o.kind, o.advertiser_role, o.onboarding_status, o.onboarding_note,
    ap.full_name, o.onboarding_assignee, o.created_at, op.full_name, op.email, coalesce(o.contact_phone, op.phone),
    o.identity_checked_at, o.authority_checked_at,
    (select count(*)::int from public.properties p where p.org_id = o.id),
    (select count(*)::int from public.listings l where l.org_id = o.id)
  from public.organizations o
  left join public.profiles ap on ap.id = o.onboarding_assignee
  left join public.profiles op on op.id = o.created_by
  order by (o.onboarding_status in ('new', 'in_review', 'changes_needed')) desc, o.created_at desc
  limit 200;
end $$;

create or replace function public.admin_update_onboarding(
  p_org uuid, p_status text default null, p_note text default null, p_assign_to_me boolean default false,
  p_identity_checked date default null, p_authority_checked date default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_status is not null and p_status not in ('new', 'in_review', 'approved', 'changes_needed', 'rejected') then
    perform app.raise_error('validation', 'Unknown status.');
  end if;
  update public.organizations set
    onboarding_status = coalesce(p_status, onboarding_status),
    onboarding_note = coalesce(nullif(trim(p_note), ''), onboarding_note),
    onboarding_assignee = case when p_assign_to_me then auth.uid() else onboarding_assignee end,
    identity_checked_at = coalesce(p_identity_checked, identity_checked_at),
    authority_checked_at = coalesce(p_authority_checked, authority_checked_at)
  where id = p_org;
  perform app.audit(p_org, null, 'onboarding_updated', 'organization', p_org::text,
    jsonb_build_object('status', p_status, 'note', p_note, 'identity_checked', p_identity_checked,
      'authority_checked', p_authority_checked));
end $$;

create or replace function public.admin_record_property_visit(p_property uuid, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  perform app.require_admin();
  update public.properties set property_visited_at = p_date where id = p_property returning org_id into v_org;
  perform app.audit(v_org, p_property, 'property_visited', 'property', p_property::text,
    jsonb_build_object('date', p_date));
end $$;

create or replace function public.admin_recent_registrations(p_limit int default 20)
returns table (user_id uuid, full_name text, email text, created_at timestamptz, workspaces int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
  select p.id, p.full_name, p.email, p.created_at,
    (select count(*)::int from public.memberships m where m.user_id = p.id and m.status = 'active')
  from public.profiles p order by p.created_at desc limit least(p_limit, 200);
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_status not in ('reviewing', 'resolved', 'dismissed') then perform app.raise_error('validation', 'Unknown status.'); end if;
  update public.listing_reports set status = p_status, resolution_note = nullif(trim(p_note), ''),
    resolved_by = auth.uid() where id = p_report;
end $$;

create or replace function public.admin_retry_delivery(p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.delivery_tasks set status = 'queued', next_attempt_at = now()
  where id = p_task and status in ('failed', 'queued');
end $$;

-- ---------------------------------------------------------------------------
-- Delivery worker support (service role only).
-- ---------------------------------------------------------------------------

create or replace function public.claim_delivery_tasks(p_limit int default 20)
returns setof public.delivery_tasks
language sql security definer set search_path = '' as $$
  update public.delivery_tasks t set status = 'sending', attempts = attempts + 1, updated_at = now()
  where t.id in (
    select id from public.delivery_tasks
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and updated_at < now() - interval '10 minutes')
    order by next_attempt_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100))
  returning t.*
$$;

create or replace function public.finish_delivery_task(p_task uuid, p_ok boolean, p_provider_ref text, p_error text,
  p_retryable boolean default true)
returns void
language sql security definer set search_path = '' as $$
  update public.delivery_tasks set
    status = case when p_ok then 'accepted'
                  when not p_retryable or attempts >= 5 then 'failed'
                  else 'queued' end,
    provider_ref = coalesce(p_provider_ref, provider_ref),
    last_error = case when p_ok then null else left(p_error, 500) end,
    next_attempt_at = now() + make_interval(mins => power(2, least(attempts, 6))::int),
    -- One-time secrets (invitation tokens) are removed once the message is handed over.
    payload = case when p_ok then payload - 'token' else payload end
  where id = p_task
$$;

-- ---------------------------------------------------------------------------
-- Final privilege hardening: functions are callable only by signed-in users unless
-- explicitly public. Every function also checks permissions itself.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.claim_delivery_tasks(int),
  public.finish_delivery_task(uuid, boolean, text, text, boolean) from authenticated;
grant execute on function public.search_listings(jsonb), public.get_listing(text), public.log_contact(text, text),
  public.invitation_preview(text) to anon;

alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- Scheduled rent charges (pg_cron), when the extension is available.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('generate-due-rent-charges', '15 0 * * *', 'select app.generate_due_charges()');
  end if;
exception when others then
  raise notice 'pg_cron not configured: %', sqlerrm;
end $$;
