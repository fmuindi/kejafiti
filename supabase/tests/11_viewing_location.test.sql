-- Directions to a viewing: the exact location goes only to the tenant of a confirmed viewing,
-- and only until 12 hours after the viewing time.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a2222222-0000-0000-0000-0000000000aa', 'owner11@example.test', '{"full_name":"Wanjiru K"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b2222222-0000-0000-0000-0000000000bb', 'tenant11a@example.test', '{"full_name":"Tenant A"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b3333333-0000-0000-0000-0000000000bb', 'tenant11b@example.test', '{"full_name":"Tenant B"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c2222222-0000-0000-0000-0000000000cc', 'admin11@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c2222222-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- A published listing ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Wanjiru Maps', 'landlord'));
insert into ctx values ('listing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Mapville', 'road', 'Test Rd', 'unit_label', 'C7', 'layout', 'bedsitter_studio')));
update public.listings set rent_amount = 12000, deposit_months = 1, title = 'Bedsitter near the stage',
  available_from = '2026-11-01', contact_phone = '0712345678', viewing_instructions = 'Ask for the caretaker at gate 2'
where id = (select v::uuid from ctx where k = 'listing');
insert into public.listing_charges (listing_id, kind, amount, frequency, billing) values
  ((select v::uuid from ctx where k = 'listing'), 'water', null, 'monthly', 'metered');
insert into public.listing_photos (listing_id, org_id, storage_path, position)
select (select v::uuid from ctx where k = 'listing'), (select v::uuid from ctx where k = 'org'),
       (select v from ctx where k = 'org') || '/' || (select v from ctx where k = 'listing') || '/p' || g || '.jpg', g
from generate_series(1, 4) g;
select public.submit_listing((select v::uuid from ctx where k = 'listing'));
reset role;
select set_config('request.jwt.claims', '{"sub":"c2222222-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.admin_review_listing((select v::uuid from ctx where k = 'listing'), 'publish', null);
reset role;
insert into ctx values ('ref', (select ref from public.listings where id = (select v::uuid from ctx where k = 'listing')));

-- Tenant A enquires --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('conv', public.start_conversation((select v from ctx where k = 'ref'), 'Is water included?', gen_random_uuid()));
reset role;
update public.properties set latitude = -1.2051, longitude = 36.7782, road = 'Banana Hill Rd', landmark = 'Opposite the green gate'
where id = (select property_id from public.listings where id = (select v::uuid from ctx where k = 'listing'));
create function pg_temp.loc() returns int language sql as $$
  select count(*)::int from public.viewing_location((select v::uuid from ctx where k = 'viewing')) $$;

select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('viewing', public.request_viewing((select v from ctx where k = 'ref'), now() + interval '2 days', null, gen_random_uuid()));
select is(pg_temp.loc(), 0, 'No exact location while the viewing is only requested');
reset role;

select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.respond_viewing((select v::uuid from ctx where k = 'viewing'), 'accept');
reset role;

select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select latitude || ',' || longitude from public.viewing_location((select v::uuid from ctx where k = 'viewing'))),
  '-1.205100,36.778200', 'Once confirmed, the tenant gets the exact position');
select is((select address || ' | ' || landmark from public.viewing_location((select v::uuid from ctx where k = 'viewing'))),
  'Banana Hill Rd, Mapville | Opposite the green gate', 'and the address and landmark');
reset role;

select set_config('request.jwt.claims', '{"sub":"b3333333-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.loc(), 0, 'Another tenant gets nothing');
reset role;
set local role anon;
select throws_ok($$ select * from public.viewing_location(gen_random_uuid()) $$, '42501', null, 'Signed-out visitors cannot call it');
reset role;

-- Long after the viewing, the address is no longer handed out.
update public.viewings set confirmed_start = now() - interval '13 hours' where id = (select v::uuid from ctx where k = 'viewing');
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.loc(), 0, 'Twelve hours after the viewing, the location is withdrawn');
reset role;

select * from finish();
rollback;
