-- Listing photo rows may only name files inside their own listing's folder.
--
-- app.can_read_listing_object grants read access to any object named by a listing_photos row on a
-- listing the caller manages. Before this migration nothing tied those names to the listing's
-- folder, so a landlord could insert (or update) a row on their own listing that named another
-- workspace's object (e.g. a photo from a paused or draft listing) and then sign a URL for it.
-- Updating storage_path on a live listing also swapped in images that had never been reviewed,
-- because the review guard only fires on insert.
--
-- 1. Every insert must use paths under '<org_id>/<listing_id>/', and org_id must be the listing's.
-- 2. The file columns can't be changed afterwards (delete the photo and upload a new one, which
--    goes through review like any added photo).
-- 3. The storage read check itself also requires the object to sit in the listing's folder, so
--    any older row that doesn't follow the rule grants nothing.

create or replace function app.listing_photo_paths_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_prefix text;
begin
  if tg_op = 'UPDATE' and (new.storage_path is distinct from old.storage_path
      or new.thumb_path is distinct from old.thumb_path
      or new.listing_id is distinct from old.listing_id
      or new.org_id is distinct from old.org_id) then
    perform app.raise_error('validation', 'A photo''s file can''t be changed. Remove the photo and add a new one.');
  end if;
  if tg_op = 'INSERT' then
    select l.org_id into v_org from public.listings l where l.id = new.listing_id;
    if v_org is null or new.org_id is distinct from v_org then
      perform app.raise_error('validation', 'Upload the photo to this listing.');
    end if;
    v_prefix := new.org_id::text || '/' || new.listing_id::text || '/';
    if not app.is_listing_object_path(new.storage_path, v_prefix)
       or (new.thumb_path is not null and not app.is_listing_object_path(new.thumb_path, v_prefix)) then
      perform app.raise_error('validation', 'Upload the photo to this listing.');
    end if;
  end if;
  return new;
end $$;

-- A file directly inside the folder: the prefix, then one non-empty name with no further "/".
create or replace function app.is_listing_object_path(p_name text, p_prefix text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name is not null
     and left(p_name, length(p_prefix)) = p_prefix
     and length(p_name) > length(p_prefix)
     and position('/' in substr(p_name, length(p_prefix) + 1)) = 0
     and substr(p_name, length(p_prefix) + 1) not in ('.', '..')
$$;

drop trigger if exists listing_photos_paths_guard on public.listing_photos;
create trigger listing_photos_paths_guard before insert or update on public.listing_photos
  for each row execute function app.listing_photo_paths_guard();

create or replace function app.can_read_listing_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listing_photos ph join public.listings l on l.id = ph.listing_id
    where (ph.storage_path = p_name or ph.thumb_path = p_name)
      and app.is_listing_object_path(p_name, l.org_id::text || '/' || l.id::text || '/')
      and (l.status = 'published' or app.can(l.property_id, 'manage_listings') or app.is_platform_admin()))
$$;

revoke all on function app.listing_photo_paths_guard() from public;
revoke all on function app.is_listing_object_path(text, text) from public;
grant execute on function app.is_listing_object_path(text, text) to anon, authenticated;

-- Report (don't delete) any existing rows that break the rule; they no longer grant file access.
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.listing_photos ph
  where not app.is_listing_object_path(ph.storage_path, ph.org_id::text || '/' || ph.listing_id::text || '/')
     or (ph.thumb_path is not null and not app.is_listing_object_path(ph.thumb_path, ph.org_id::text || '/' || ph.listing_id::text || '/'));
  if v_bad > 0 then
    raise notice '% listing photo row(s) name files outside their listing folder; they no longer grant read access.', v_bad;
  end if;
end $$;
