-- Listing photo rows can only name files in their own listing's folder, and can't be repointed.
-- Guards against a landlord reading another workspace's unpublished photos through a photo row.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a2100000-0000-0000-0000-0000000000aa', 'attacker21@example.test', '{"full_name":"Attacker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b2100000-0000-0000-0000-0000000000bb', 'victim21@example.test', '{"full_name":"Victim"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;
create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true) $$;
create function pg_temp.v(p text) returns text language sql as $$ select v from ctx where k = p $$;

-- Victim: a draft listing with a photo file that only their team should see.
select pg_temp.as_user('b2100000-0000-0000-0000-0000000000bb');
set local role authenticated;
insert into ctx values ('orgB', public.create_workspace('Victim Lets', 'landlord'));
insert into ctx values ('listingB', public.start_listing(jsonb_build_object('org_id', pg_temp.v('orgB'),
  'area', 'Privateville', 'road', 'Hidden Rd', 'unit_label', 'V1', 'layout', 'bedsitter_studio')));
reset role;
insert into ctx values ('secret', pg_temp.v('orgB') || '/' || pg_temp.v('listingB') || '/secret.jpg');
insert into storage.objects (bucket_id, name) values ('listing-media', pg_temp.v('secret'));

-- Attacker: their own workspace and listing.
select pg_temp.as_user('a2100000-0000-0000-0000-0000000000aa');
set local role authenticated;
insert into ctx values ('orgA', public.create_workspace('Attacker Lets', 'landlord'));
insert into ctx values ('listingA', public.start_listing(jsonb_build_object('org_id', pg_temp.v('orgA'),
  'area', 'Attackville', 'road', 'Some Rd', 'unit_label', 'A1', 'layout', 'bedsitter_studio')));
insert into ctx values ('own', pg_temp.v('orgA') || '/' || pg_temp.v('listingA') || '/');

select lives_ok($$ insert into public.listing_photos (listing_id, org_id, storage_path, thumb_path, position)
  values (pg_temp.v('listingA')::uuid, pg_temp.v('orgA')::uuid, pg_temp.v('own') || 'p1.jpg', pg_temp.v('own') || 'p1_thumb.jpg', 0) $$,
  'A photo in the listing''s own folder is accepted');

select throws_like($$ insert into public.listing_photos (listing_id, org_id, storage_path, thumb_path, position)
  values (pg_temp.v('listingA')::uuid, pg_temp.v('orgA')::uuid, pg_temp.v('own') || 'p2.jpg', pg_temp.v('secret'), 1) $$,
  '%Upload the photo to this listing%', 'A thumbnail pointing at another workspace''s file is refused');

select throws_like($$ insert into public.listing_photos (listing_id, org_id, storage_path, position)
  values (pg_temp.v('listingA')::uuid, pg_temp.v('orgA')::uuid, pg_temp.v('secret'), 1) $$,
  '%Upload the photo to this listing%', 'A photo pointing at another workspace''s file is refused');

select throws_like($$ insert into public.listing_photos (listing_id, org_id, storage_path, position)
  values (pg_temp.v('listingA')::uuid, pg_temp.v('orgA')::uuid, pg_temp.v('own') || '../x.jpg', 1) $$,
  '%Upload the photo to this listing%', 'A path that climbs out of the folder is refused');

select throws_like($$ insert into public.listing_photos (listing_id, org_id, storage_path, position)
  values (pg_temp.v('listingA')::uuid, pg_temp.v('orgB')::uuid,
          pg_temp.v('orgB') || '/' || pg_temp.v('listingA') || '/x.jpg', 1) $$,
  '%Upload the photo to this listing%', 'A photo row can''t claim another workspace');

select throws_like($$ update public.listing_photos set storage_path = pg_temp.v('secret')
  where listing_id = pg_temp.v('listingA')::uuid $$,
  '%can''t be changed%', 'An existing photo can''t be repointed at another file');

select throws_like($$ update public.listing_photos set thumb_path = pg_temp.v('own') || 'other.jpg'
  where listing_id = pg_temp.v('listingA')::uuid $$,
  '%can''t be changed%', 'Not even at another file in the same folder (that would skip review)');

select lives_ok($$ update public.listing_photos set position = 3, is_cover = true, alt_text = 'Front room'
  where listing_id = pg_temp.v('listingA')::uuid $$,
  'Reordering, cover and description changes still work');

select is((select count(*)::int from storage.objects where bucket_id = 'listing-media' and name = pg_temp.v('secret')), 0,
  'The attacker can''t read the victim''s file');
reset role;

-- A row written before this rule existed no longer grants access either.
alter table public.listing_photos disable trigger listing_photos_paths_guard;
insert into public.listing_photos (listing_id, org_id, storage_path, position)
  values (pg_temp.v('listingA')::uuid, pg_temp.v('orgA')::uuid, pg_temp.v('secret'), 9);
alter table public.listing_photos enable trigger listing_photos_paths_guard;
select pg_temp.as_user('a2100000-0000-0000-0000-0000000000aa');
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'listing-media' and name = pg_temp.v('secret')), 0,
  'An older row naming another workspace''s file grants nothing');
reset role;

-- The owner still sees their own file (storage_path is unique, so drop the stray row first).
delete from public.listing_photos where storage_path = pg_temp.v('secret');
select pg_temp.as_user('b2100000-0000-0000-0000-0000000000bb');
set local role authenticated;
insert into public.listing_photos (listing_id, org_id, storage_path, position)
  values (pg_temp.v('listingB')::uuid, pg_temp.v('orgB')::uuid, pg_temp.v('secret'), 0);
select is((select count(*)::int from storage.objects where bucket_id = 'listing-media' and name = pg_temp.v('secret')), 1,
  'The listing''s own team can still read its photo');
reset role;

select * from finish();
rollback;
