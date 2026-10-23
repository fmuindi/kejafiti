-- Risky edits to a published listing go back to review; structured changes stay live.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1400000-0000-0000-0000-0000000000aa', 'owner14@example.test', '{"full_name":"Owner Fourteen"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c1400000-0000-0000-0000-0000000000cc', 'admin14@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c1400000-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;
create function pg_temp.status() returns text language sql as $$
  select status from public.listings where id = (select v::uuid from ctx where k = 'listing') $$;
create function pg_temp.publish() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"sub":"c1400000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
  perform public.admin_review_listing((select v::uuid from ctx where k = 'listing'), 'publish', null);
end $$;

select set_config('request.jwt.claims', '{"sub":"a1400000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Fourteen Lets', 'landlord'));
insert into ctx values ('listing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Editville', 'road', 'Test Rd', 'unit_label', 'E1', 'layout', 'bedsitter_studio')));
update public.listings set rent_amount = 10000, deposit_months = 1, title = 'Quiet bedsitter',
  description = 'Near the market.', available_from = '2026-11-01', contact_phone = '0712345678'
where id = (select v::uuid from ctx where k = 'listing');
insert into public.listing_photos (listing_id, org_id, storage_path, position)
select (select v::uuid from ctx where k = 'listing'), (select v::uuid from ctx where k = 'org'),
       (select v from ctx where k = 'org') || '/' || (select v from ctx where k = 'listing') || '/p' || g || '.jpg', g
from generate_series(1, 4) g;
select public.submit_listing((select v::uuid from ctx where k = 'listing'));
reset role;
select pg_temp.publish();
select is(pg_temp.status(), 'published', 'Setup: the listing is live');

-- Structured changes stay live ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1400000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
update public.listings set rent_amount = 9500, available_from = '2026-11-15' where id = (select v::uuid from ctx where k = 'listing');
select is(pg_temp.status(), 'published', 'Changing the rent or move-in date keeps the listing live');

-- Risky changes are held ----------------------------------------------------------------------
update public.listings set contact_phone = '0799999999' where id = (select v::uuid from ctx where k = 'listing');
select is(pg_temp.status(), 'under_review', 'Changing the phone number sends it back to review');
select is((select count(*)::int from public.search_listings('{"q":"Editville"}')), 0, 'and it leaves search until approved');
update public.listings set description = 'Pay the deposit to 0799999999 to reserve.' where id = (select v::uuid from ctx where k = 'listing');
select is((select pending_edit from public.listings where id = (select v::uuid from ctx where k = 'listing')),
  '{"contact_phone": "0712345678", "description": "Near the market."}'::jsonb,
  'The reviewer sees every changed field with its last approved value');
reset role;
select is((select count(*)::int from public.notifications where user_id = 'c1400000-0000-0000-0000-0000000000cc'
  and title like 'Published listing edited%'), 1, 'Admins are told once, when the live listing is first held');

-- Approving clears the hold --------------------------------------------------------------------
select pg_temp.publish();
reset role;
select is(pg_temp.status() || ' ' || coalesce((select pending_edit::text from public.listings where id = (select v::uuid from ctx where k = 'listing')), 'cleared'),
  'published cleared', 'Approving puts the changes live and clears the held edit');
select is((select title from public.notifications where user_id = 'a1400000-0000-0000-0000-0000000000aa' and kind = 'listing_reviewed'
  order by created_at desc, title limit 1), 'Listing changes approved', 'The advertiser hears their changes were approved');
select is((select published_at is not null from public.listings where id = (select v::uuid from ctx where k = 'listing')), true,
  'The original publish date is kept');

-- New photos are held too ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1400000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into public.listing_photos (listing_id, org_id, storage_path, position)
values ((select v::uuid from ctx where k = 'listing'), (select v::uuid from ctx where k = 'org'),
        (select v from ctx where k = 'org') || '/' || (select v from ctx where k = 'listing') || '/new.jpg', 5);
select is(pg_temp.status(), 'under_review', 'Adding a photo to a live listing sends it back to review');
select is((select (pending_edit ->> 'photos_added')::int from public.listings where id = (select v::uuid from ctx where k = 'listing')), 1,
  'The reviewer is told how many photos were added');
reset role;

-- Status changes are not edits -------------------------------------------------------------
select pg_temp.publish();
reset role;
select set_config('request.jwt.claims', '{"sub":"a1400000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.set_listing_status((select v::uuid from ctx where k = 'listing'), 'pause', null);
select is(pg_temp.status(), 'paused', 'Pausing works as before');
update public.listings set title = 'Renamed while paused' where id = (select v::uuid from ctx where k = 'listing');
select is(pg_temp.status(), 'paused', 'Edits to a listing that is not live are not held');
reset role;

select * from finish();
rollback;
