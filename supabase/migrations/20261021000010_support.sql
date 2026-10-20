-- IMP-19: help and support, separate from landlord-tenant chat.
--
-- A ticket belongs to the person who opened it. They and platform admins can read it;
-- nobody else, including the workspace they mention. Tickets hold only what the person
-- writes or attaches, plus an optional internal link for context: admins get no new access
-- to conversations, rent records or private documents through support.
-- Evidence files live in a separate private bucket, path <ticket_id>/<file>, readable by
-- the ticket owner and platform admins only.
--
-- Rollback: drop the support functions, tables, bucket policies and bucket.

create sequence public.support_ticket_ref_seq start 1001;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('SUP-' || nextval('public.support_ticket_ref_seq')::text),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('account', 'listing', 'rent_records', 'team', 'viewing_or_message', 'other')),
  subject text not null check (length(trim(subject)) between 3 and 140),
  description text not null check (length(trim(description)) between 10 and 4000),
  context_link text check (context_link is null or (context_link like '/%' and context_link not like '//%' and length(context_link) <= 300)),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_you', 'resolved')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assignee_id uuid references public.profiles (id),
  client_ref uuid unique,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_queue_idx on public.support_tickets (status, priority, created_at);
create trigger support_tickets_touch before update on public.support_tickets
  for each row execute function app.touch_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  side text not null check (side in ('user', 'support', 'system')),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create table public.support_files (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (length(file_name) <= 200),
  mime_type text not null,
  size_bytes int not null check (size_bytes between 1 and 15728640),
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_files enable row level security;

create function app.can_see_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.support_tickets t where t.id = p_ticket and (t.user_id = auth.uid() or app.is_platform_admin()))
$$;
grant execute on function app.can_see_ticket(uuid) to authenticated;

create policy support_tickets_select on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());
create policy support_messages_select on public.support_messages for select to authenticated
  using (app.can_see_ticket(ticket_id));
create policy support_files_select on public.support_files for select to authenticated
  using (app.can_see_ticket(ticket_id));
revoke all on public.support_tickets, public.support_messages, public.support_files from anon;
revoke insert, update, delete on public.support_tickets, public.support_messages, public.support_files from authenticated;

-- Evidence bucket ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-files', 'support-files', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy support_files_read on storage.objects for select to authenticated
  using (bucket_id = 'support-files' and app.can_see_ticket(app.safe_uuid((storage.foldername(name))[1])));
-- Only the ticket owner uploads, and only into their own ticket's folder.
create policy support_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support-files' and exists (
    select 1 from public.support_tickets t where t.id = app.safe_uuid((storage.foldername(name))[1]) and t.user_id = auth.uid()));

-- Notifications -------------------------------------------------------------------------------
create function app.notify_support_admins(p_ticket public.support_tickets, p_key text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid;
begin
  for v_admin in select a.user_id from public.platform_admins a loop
    perform app.notify(v_admin, null, p_key, 'support_ticket', p_title, p_ticket.ref || ' · ' || p_ticket.subject, '/admin/support/' || p_ticket.id);
  end loop;
end $$;

-- People -------------------------------------------------------------------------------------
create function public.create_support_ticket(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t public.support_tickets; v_client uuid := nullif(p ->> 'client_ref', '')::uuid;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to contact support.'); end if;
  if v_client is not null then
    select * into v_t from public.support_tickets where client_ref = v_client and user_id = auth.uid();
    if v_t.id is not null then return jsonb_build_object('id', v_t.id, 'ref', v_t.ref, 'replayed', true); end if;
  end if;
  if length(trim(coalesce(p ->> 'subject', ''))) < 3 then perform app.raise_error('validation', 'Add a short subject.'); end if;
  if length(trim(coalesce(p ->> 'description', ''))) < 10 then perform app.raise_error('validation', 'Describe what happened in a sentence or two.'); end if;
  insert into public.support_tickets (user_id, category, subject, description, context_link, client_ref)
  values (auth.uid(), coalesce(nullif(p ->> 'category', ''), 'other'), trim(p ->> 'subject'), trim(p ->> 'description'),
          nullif(trim(coalesce(p ->> 'context_link', '')), ''), v_client)
  returning * into v_t;
  perform app.notify_support_admins(v_t, 'support_new:' || v_t.id, 'New support request');
  return jsonb_build_object('id', v_t.id, 'ref', v_t.ref);
end $$;

create function public.reply_support_ticket(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.support_tickets; v_admin boolean := app.is_platform_admin(); v_msg uuid;
begin
  select * into v_t from public.support_tickets where id = p_ticket for update;
  if v_t.id is null or not (v_t.user_id = auth.uid() or v_admin) then perform app.raise_error('not_found', 'Support request not found.'); end if;
  if length(trim(coalesce(p_body, ''))) = 0 then perform app.raise_error('validation', 'Write a reply first.'); end if;
  insert into public.support_messages (ticket_id, author_id, side, body)
  values (p_ticket, auth.uid(), case when v_t.user_id = auth.uid() then 'user' else 'support' end, trim(p_body))
  returning id into v_msg;
  if v_t.user_id = auth.uid() then
    -- A reply from the person reopens a resolved request and puts it back in the queue.
    update public.support_tickets set status = case when status in ('resolved', 'waiting_on_you') then 'open' else status end,
      resolved_at = null where id = p_ticket;
    perform app.notify_support_admins(v_t, 'support_reply:' || v_msg, 'Reply on a support request');
  else
    update public.support_tickets set status = case when status = 'open' then 'in_progress' else status end where id = p_ticket;
    perform app.notify(v_t.user_id, null, 'support_reply:' || v_msg, 'support_reply', 'Support replied · ' || v_t.ref, left(trim(p_body), 120), '/help/tickets/' || v_t.id);
  end if;
end $$;

-- Admins -------------------------------------------------------------------------------------
create function public.admin_update_ticket(p_ticket uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.support_tickets;
begin
  perform app.require_admin();
  select * into v_t from public.support_tickets where id = p_ticket for update;
  if v_t.id is null then perform app.raise_error('not_found', 'Support request not found.'); end if;
  update public.support_tickets set
    status = coalesce(nullif(p ->> 'status', ''), status),
    priority = coalesce(nullif(p ->> 'priority', ''), priority),
    assignee_id = case when (p ->> 'assign_to_me')::boolean then auth.uid() else assignee_id end,
    resolved_at = case when p ->> 'status' = 'resolved' then now() when p ->> 'status' is not null then null else resolved_at end
  where id = p_ticket;
  if p ->> 'status' is not null and p ->> 'status' <> v_t.status then
    insert into public.support_messages (ticket_id, author_id, side, body)
    values (p_ticket, auth.uid(), 'system', 'Status changed to ' || replace(p ->> 'status', '_', ' '));
    if p ->> 'status' in ('resolved', 'waiting_on_you') then
      perform app.notify(v_t.user_id, null, 'support_status:' || p_ticket || ':' || (p ->> 'status') || ':' || extract(epoch from now()),
        'support_status', case when p ->> 'status' = 'resolved' then 'Support request resolved · ' else 'Support needs your reply · ' end || v_t.ref,
        v_t.subject, '/help/tickets/' || v_t.id);
    end if;
  end if;
  perform app.audit(null, null, 'support_ticket_updated', 'support_ticket', p_ticket::text, p);
end $$;

-- Record an uploaded evidence file (the storage policy already limited where it can go).
create function public.register_support_file(p_ticket uuid, p_path text, p_name text, p_mime text, p_size int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.support_tickets where id = p_ticket and user_id = auth.uid()) then
    perform app.raise_error('not_found', 'Support request not found.');
  end if;
  if split_part(p_path, '/', 1) <> p_ticket::text then perform app.raise_error('validation', 'File path does not match the request.'); end if;
  insert into public.support_files (ticket_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_ticket, p_path, left(p_name, 200), p_mime, p_size, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_queue_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_health jsonb := public.admin_delivery_health();
begin
  return jsonb_build_object(
    'onboarding', (select count(*) from public.organizations where onboarding_status in ('new', 'in_review', 'changes_needed')),
    'listing_review', (select count(*) from public.listings where status = 'under_review'),
    'listing_reports', (select count(*) from public.listing_reports where status in ('open', 'reviewing')),
    'support_open', (select count(*) from public.support_tickets where status in ('open', 'in_progress')),
    'delivery_failures', (v_health ->> 'failed')::int,
    'delivery_queued', (v_health ->> 'due')::int + (v_health ->> 'scheduled')::int,
    'delivery_attention', (v_health ->> 'failed')::int + (v_health ->> 'overdue')::int + (v_health ->> 'held')::int + (v_health ->> 'stuck')::int,
    'oldest_review_hours', (select extract(epoch from now() - min(submitted_at)) / 3600 from public.listings where status = 'under_review'),
    'submitted_today', (select count(*) from public.listings where submitted_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'published_today', (select count(*) from public.listings where published_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'sent_back', (select count(*) from public.listings where status = 'needs_correction')
  );
end $$;

revoke execute on function public.create_support_ticket(jsonb), public.reply_support_ticket(uuid, text),
  public.admin_update_ticket(uuid, jsonb), public.register_support_file(uuid, text, text, text, int) from public, anon;
grant execute on function public.create_support_ticket(jsonb), public.reply_support_ticket(uuid, text),
  public.admin_update_ticket(uuid, jsonb), public.register_support_file(uuid, text, text, text, int) to authenticated, service_role;
revoke execute on function app.notify_support_admins(public.support_tickets, text, text) from public, anon, authenticated;
