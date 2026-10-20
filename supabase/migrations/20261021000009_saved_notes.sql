-- IMP-12: private notes on saved homes, for comparing a shortlist.
--
-- The note lives on the person's own saved_listings row, so the existing policy
-- (user_id = auth.uid()) keeps it private; there is no second favourites system.
--
-- Rollback: restore my_saved_listings from 20261021000001_tenant_listing_context.sql and
-- drop column saved_listings.note.

alter table public.saved_listings add column note text check (length(note) <= 500);

drop function public.my_saved_listings();
create function public.my_saved_listings()
returns table (listing_id uuid, ref text, title text, status text, let_on date, area text, saved_at timestamptz, note text)
language sql stable security definer set search_path = '' as $$
  select s.listing_id, l.ref, l.title, l.status, l.let_on, p.area, s.created_at, s.note
  from public.saved_listings s
  join public.listings l on l.id = s.listing_id
  join public.properties p on p.id = l.property_id
  where s.user_id = auth.uid()
  order by s.created_at desc
  limit 200
$$;
revoke execute on function public.my_saved_listings() from public, anon;
grant execute on function public.my_saved_listings() to authenticated, service_role;
