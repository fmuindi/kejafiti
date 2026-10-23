-- Re-review of risky edits to published listings.
--
-- A published listing that changes its wording, contact details or viewing instructions, or
-- gains a photo, goes back to review and is hidden until an admin approves it. That is where
-- bait-and-switch and payment scams happen ("send the deposit to this number"). Price,
-- charges, facts and availability stay live: they are structured, shown in full, and can be
-- reported.
--
-- pending_edit keeps the values as they were when the listing was last approved (the first
-- edit's "before" wins), plus a count of photos added, so the reviewer can see what changed.
--
-- Rollback: drop trigger listings_edit_guard on public.listings; drop trigger
-- listing_photos_edit_guard on public.listing_photos; drop function app.listing_edit_guard(),
-- app.listing_photo_guard(), app.flag_listing_for_rereview(uuid, jsonb); restore
-- public.admin_review_listing from 20261016000006_storage_admin.sql;
-- alter table public.listings drop column pending_edit.

alter table public.listings add column pending_edit jsonb;

create or replace function app.alert_admins_of_edit(p_listing public.listings) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid;
begin
  for v_admin in select user_id from public.platform_admins loop
    perform app.notify(v_admin, null, 'listing_edit_review:' || p_listing.id || ':' || extract(epoch from clock_timestamp()),
      'listing_review', 'Published listing edited · needs a fresh review', coalesce(p_listing.title, p_listing.ref), '/admin/listings/' || p_listing.id);
  end loop;
  perform app.audit(p_listing.org_id, p_listing.property_id, 'listing_edit_held', 'listing', p_listing.id::text,
    coalesce(p_listing.pending_edit, '{}'::jsonb));
end $$;

create or replace function app.listing_edit_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := to_jsonb(old);
  v_after jsonb := to_jsonb(new);
  v_changed jsonb := '{}'::jsonb;
  k text;
begin
  -- Edits to a live listing, or to one already held for an edit (so the reviewer sees those
  -- too). Status changes (pause, let, review) go through their own functions.
  if new.status <> old.status or not (old.status = 'published' or (old.status = 'under_review' and old.pending_edit is not null)) then
    return new;
  end if;
  foreach k in array array['title', 'description', 'contact_phone', 'contact_call', 'contact_whatsapp',
                           'viewing_instructions', 'house_rules'] loop
    if (v_after -> k) is distinct from (v_before -> k) then
      v_changed := v_changed || jsonb_build_object(k, v_before -> k);
    end if;
  end loop;
  if v_changed = '{}'::jsonb then return new; end if;
  new.pending_edit := v_changed || coalesce(old.pending_edit, '{}'::jsonb);
  if old.status = 'published' then
    new.status := 'under_review';
    new.submitted_at := now();
    perform app.alert_admins_of_edit(new);
  end if;
  return new;
end $$;

create trigger listings_edit_guard before update on public.listings
  for each row execute function app.listing_edit_guard();

create or replace function app.listing_photo_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings;
begin
  update public.listings l set
    status = 'under_review',
    submitted_at = case when l.status = 'published' then now() else l.submitted_at end,
    pending_edit = coalesce(l.pending_edit, '{}'::jsonb)
      || jsonb_build_object('photos_added', coalesce((l.pending_edit ->> 'photos_added')::int, 0) + 1)
  where l.id = new.listing_id
    and (l.status = 'published' or (l.status = 'under_review' and l.pending_edit is not null))
  returning * into v_l;
  -- Tell admins once, when the live listing is first held.
  if v_l.id is not null and (v_l.pending_edit ->> 'photos_added')::int = 1 and v_l.pending_edit - 'photos_added' = '{}'::jsonb then
    perform app.alert_admins_of_edit(v_l);
  end if;
  return new;
end $$;

create trigger listing_photos_edit_guard after insert on public.listing_photos
  for each row execute function app.listing_photo_guard();

-- Same decision as before; it now also clears the held edit, and its notice says whether
-- the advertiser's changes (rather than a new listing) were approved.
create or replace function public.admin_review_listing(p_listing uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings; v_edit boolean;
begin
  perform app.require_admin();
  select * into v_l from public.listings where id = p_listing for update;
  if v_l.id is null then perform app.raise_error('not_found', 'Listing not found.'); end if;
  if v_l.status <> 'under_review' then perform app.raise_error('validation', 'This listing is not waiting for review.'); end if;
  if p_decision not in ('publish', 'needs_correction') then perform app.raise_error('validation', 'Unknown decision.'); end if;
  if p_decision = 'needs_correction' and length(trim(coalesce(p_note, ''))) < 3 then
    perform app.raise_error('reason_required', 'Tell the advertiser exactly what to correct.');
  end if;
  v_edit := v_l.pending_edit is not null;
  update public.listings set status = case when p_decision = 'publish' then 'published' else 'needs_correction' end,
    review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now(),
    published_at = case when p_decision = 'publish' then coalesce(published_at, now()) else published_at end,
    pending_edit = null
  where id = p_listing;
  perform app.audit(v_l.org_id, v_l.property_id, 'listing_reviewed', 'listing', p_listing::text,
    jsonb_build_object('decision', p_decision, 'note', p_note, 'edit', v_l.pending_edit));
  perform app.notify_advertiser_team(v_l.property_id, v_l.org_id, 'listing_reviewed:' || p_listing || ':' || extract(epoch from clock_timestamp()),
    'listing_reviewed',
    case when p_decision = 'publish' then case when v_edit then 'Listing changes approved' else 'Listing published' end
         else case when v_edit then 'Listing changes need a correction' else 'Listing needs a correction' end end,
    coalesce(v_l.title, v_l.ref) || coalesce(': ' || nullif(trim(p_note), ''), ''),
    '/w/' || v_l.org_id || '/listings/' || p_listing);
end $$;
