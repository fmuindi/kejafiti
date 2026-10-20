-- Marketplace rules: cost totals, Yes/No/Unknown must-haves, publication visibility,
-- listing-based conversations and viewing state separation.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1111111-0000-0000-0000-0000000000aa', 'grace@example.test', '{"full_name":"Grace W"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b1111111-0000-0000-0000-0000000000bb', 'achieng@example.test', '{"full_name":"Achieng"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c1111111-0000-0000-0000-0000000000cc', 'admin2@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c1111111-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- Landlord lists a bedsitter: rent 14,000 + service 1,000; deposit 1 month; water metered.
select set_config('request.jwt.claims', '{"sub":"a1111111-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Grace W', 'landlord'));
insert into ctx values ('listing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Pgtapville', 'road', 'Test Rd', 'unit_label', 'B4', 'layout', 'bedsitter_studio')));
update public.listings set rent_amount = 14000, deposit_months = 1, title = 'Bedsitter with private bathroom',
  available_from = '2026-11-01', contact_phone = '0712345678'
where id = (select v::uuid from ctx where k = 'listing');
insert into public.listing_charges (listing_id, kind, amount, frequency, billing) values
  ((select v::uuid from ctx where k = 'listing'), 'service_charge', 1000, 'monthly', 'fixed'),
  ((select v::uuid from ctx where k = 'listing'), 'water', null, 'monthly', 'metered');
update public.units set facts = '{"private_bathroom":"yes","parking":"unknown","own_meter":"yes"}'::jsonb
where id = (select unit_id from public.listings where id = (select v::uuid from ctx where k = 'listing'));

select is((select fixed_monthly_total from public.listings where id = (select v::uuid from ctx where k = 'listing')), 15000.00::numeric,
  'Fixed monthly total = rent + compulsory fixed monthly charges');
select is((select move_in_total from public.listings where id = (select v::uuid from ctx where k = 'listing')), 29000.00::numeric,
  'Move-in total = first month (15,000) + deposit (14,000)');
select ok((select totals_complete from public.listings where id = (select v::uuid from ctx where k = 'listing')), 'Totals are complete');

insert into public.listing_charges (listing_id, kind, amount, frequency, billing) values
  ((select v::uuid from ctx where k = 'listing'), 'garbage', null, 'monthly', 'fixed');
select ok(not (select totals_complete from public.listings where id = (select v::uuid from ctx where k = 'listing')),
  'An unconfirmed compulsory charge marks the total incomplete');
delete from public.listing_charges where listing_id = (select v::uuid from ctx where k = 'listing') and kind = 'garbage';

select throws_like($$ select public.submit_listing((select v::uuid from ctx where k = 'listing')) $$, '%at least 4 photos%',
  'A listing cannot be submitted without enough photos');
select throws_like($$ update public.listings set status = 'published' where id = (select v::uuid from ctx where k = 'listing') $$,
  '%permission denied%', 'Advertisers cannot publish their own listing directly');

-- Photos (rows only; storage objects are not needed for this check).
insert into public.listing_photos (listing_id, org_id, storage_path, position)
select (select v::uuid from ctx where k = 'listing'), (select v::uuid from ctx where k = 'org'),
       (select v from ctx where k = 'org') || '/' || (select v from ctx where k = 'listing') || '/p' || g || '.jpg', g
from generate_series(1, 4) g;
select lives_ok($$ select public.submit_listing((select v::uuid from ctx where k = 'listing')) $$, 'Complete listing is submitted for review');
select is((select status from public.listings where id = (select v::uuid from ctx where k = 'listing')), 'under_review', 'Status is Under review');
insert into ctx values ('ref_known', (select ref from public.listings where id = (select v::uuid from ctx where k = 'listing')));

-- Not public until reviewed.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from public.search_listings('{"q":"Pgtapville"}'::jsonb)), 0, 'Unreviewed listings do not appear in search');
select is(public.get_listing((select v from ctx where k = 'ref_known')), null::jsonb, 'Unreviewed listings cannot be opened by the public');

reset role;
select set_config('request.jwt.claims', '{"sub":"c1111111-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.admin_review_listing((select v::uuid from ctx where k = 'listing'), 'publish', null) $$, 'Admin publishes the listing');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into ctx values ('ref', (select ref from public.search_listings('{"q":"pgtapville"}'::jsonb) limit 1));
select ok((select v from ctx where k = 'ref') is not null, 'Published listing is found by area (case-insensitive) without an account');
select is((select count(*)::int from public.search_listings('{"q":"Pgtapville","must_haves":["private_bathroom"]}'::jsonb)), 1, 'A confirmed "yes" satisfies a must-have');
select is((select count(*)::int from public.search_listings('{"q":"Pgtapville","must_haves":["parking"]}'::jsonb)), 0, 'An "unknown" answer does not satisfy a must-have');
select is((select count(*)::int from public.search_listings('{"q":"Pgtapville","must_haves":["parking"],"include_unconfirmed":true}'::jsonb)), 1,
  'Unknown answers are included only when the tenant asks');
select is((select count(*)::int from public.search_listings('{"q":"Pgtapville","max_rent":14500,"budget_basis":"fixed"}'::jsonb)), 0,
  'Budget on "rent + fixed charges" uses the fixed monthly total');

-- Distance search around a picked place ------------------------------------------------
select is((select count(*)::int from public.search_listings('{"q":"Pgtapville","near_lat":-1.5,"near_lng":37.5,"radius_km":5}'::jsonb)), 1,
  'A home without a map position still matches a place search by name');
reset role;
update public.properties set latitude = -1.234567, longitude = 36.987654 where area = 'Pgtapville';
set local role anon;
select is((select count(*)::int from public.search_listings('{"q":"Pgtapville","near_lat":-1.5,"near_lng":37.5,"radius_km":5}'::jsonb)), 0,
  'A positioned home outside the radius is excluded');
select is((select distance_km from public.search_listings('{"near_lat":-1.25,"near_lng":36.99,"radius_km":3}'::jsonb) where ref = (select v from ctx where k = 'ref')), 2.2,
  'Homes within the radius come back with their distance');
select is((select distance_km from public.search_listings('{"near_lat":-1.23,"near_lng":36.99,"radius_km":1}'::jsonb) where ref = (select v from ctx where k = 'ref')), 0.0,
  'Distance is measured from the rounded public position, never the exact one');
select is(((public.get_listing((select v from ctx where k = 'ref'))) ->> 'viewing_address'), null, 'The viewing address stays private before a confirmed viewing');
select throws_like($$ select public.start_conversation((select v from ctx where k = 'ref'), 'Hi', gen_random_uuid()) $$, '%permission denied%',
  'Signed-out visitors cannot message (sign-in required)');

-- Tenant enquires twice from the same listing: one conversation ------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"b1111111-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('conv1', public.start_conversation((select v from ctx where k = 'ref'), 'Is it still available?', gen_random_uuid()));
insert into ctx values ('conv2', public.start_conversation((select v from ctx where k = 'ref'), 'And is water included?', gen_random_uuid()));
select is((select v from ctx where k = 'conv1'), (select v from ctx where k = 'conv2'), 'The same conversation is reused for the same tenant and listing');
insert into ctx values ('viewing', public.request_viewing((select v from ctx where k = 'ref'), now() + interval '3 days', null, gen_random_uuid()));
select is((select status from public.viewings where id = (select v::uuid from ctx where k = 'viewing')), 'requested', 'A viewing request starts as Requested, never Confirmed');

reset role;
select set_config('request.jwt.claims', '{"sub":"a1111111-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select is((public.respond_viewing((select v::uuid from ctx where k = 'viewing'), 'accept') ->> 'ok')::boolean, true, 'Advertiser accepts the viewing');
select is((select follow_up from public.conversations where id = (select v::uuid from ctx where k = 'conv1')), 'viewing_planned', 'Enquiry follow-up moves to viewing planned');
select lives_ok($$ select public.set_listing_status((select v::uuid from ctx where k = 'listing'), 'mark_let', '2026-10-13') $$, 'Advertiser marks the home let');
select is((select status || ':' || cancelled_by_side from public.viewings where id = (select v::uuid from ctx where k = 'viewing')), 'cancelled:system',
  'Open viewings are cancelled and kept in history when the home is let');

select * from finish();
rollback;
