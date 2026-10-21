-- IMP-13: the review checklist and submission use one set of checks.
-- IMP-11: one cost definition. Monthly and move-in totals exist only for monthly prices,
-- budgets compare monthly prices, and nothing is converted between periods.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a6666666-0000-0000-0000-0000000000aa', 'owner6@example.test', '{"full_name":"Owner Six"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c6666666-0000-0000-0000-0000000000cc', 'admin6@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c6666666-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- Two listings in Costville: one per month, one per night, same charges.
select set_config('request.jwt.claims', '{"sub":"a6666666-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Costville Homes', 'landlord'));
insert into ctx values ('monthly', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Costville', 'road', 'A Rd', 'unit_label', 'M1', 'layout', 'bedsitter_studio')));
insert into ctx values ('nightly', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Costville', 'road', 'A Rd', 'unit_label', 'N1', 'layout', 'bedsitter_studio')));
update public.listings set rent_amount = 14000, price_period = 'month', deposit_months = 1, title = 'Monthly bedsitter',
  available_from = '2026-11-01', contact_phone = '0712345678' where id = (select v::uuid from ctx where k = 'monthly');
update public.listings set rent_amount = 1500, price_period = 'night', deposit_amount = 0, title = 'Nightly bedsitter',
  available_from = '2026-11-01', contact_phone = '0712345678' where id = (select v::uuid from ctx where k = 'nightly');
insert into public.listing_charges (listing_id, kind, amount, frequency, billing)
select (select v::uuid from ctx where k = x), 'service_charge', 1000, 'monthly', 'fixed' from unnest(array['monthly', 'nightly']) x;
reset role;

select is((select fixed_monthly_total::int || ' / ' || move_in_total::int from public.listings where id = (select v::uuid from ctx where k = 'monthly')),
  '15000 / 29000', 'Monthly price: 14,000 rent + 1,000 service = 15,000 a month, 29,000 to move in');
select is((select fixed_monthly_total from public.listings where id = (select v::uuid from ctx where k = 'nightly')), null::numeric,
  'Nightly price: no monthly total (1,500 a night is not added to 1,000 a month)');
select is((select move_in_total from public.listings where id = (select v::uuid from ctx where k = 'nightly')), null::numeric,
  'Nightly price: no move-in total');

update public.listings set price_period = 'month' where id = (select v::uuid from ctx where k = 'nightly');
select is((select fixed_monthly_total::int from public.listings where id = (select v::uuid from ctx where k = 'nightly')), 2500,
  'Changing the price period recomputes the totals');
update public.listings set price_period = 'night' where id = (select v::uuid from ctx where k = 'nightly');

-- IMP-13: checklist items carry the step and field that fix them.
select is((select jsonb_agg(i ->> 'code') from jsonb_array_elements(app.listing_problem_items((select v::uuid from ctx where k = 'monthly'))) i
  where (i ->> 'required')::boolean), '["photos"]'::jsonb, 'IMP-13: the only missing item is photos');
select is((select (i ->> 'step')::int || ' ' || (i ->> 'field') from jsonb_array_elements(app.listing_problem_items((select v::uuid from ctx where k = 'monthly'))) i
  where i ->> 'code' = 'photos'), '4 photos', 'IMP-13: it points at step 4, the photo controls');
select is(app.listing_problems((select v::uuid from ctx where k = 'monthly')), array['Add at least 4 photos of this unit.'],
  'IMP-13: submission sees the same required item');
insert into public.listing_charges (listing_id, kind, amount, frequency, billing) values
  ((select v::uuid from ctx where k = 'monthly'), 'garbage', null, 'monthly', 'fixed');
select is((select count(*)::int from jsonb_array_elements(app.listing_problem_items((select v::uuid from ctx where k = 'monthly'))) i
  where i ->> 'code' = 'totals' and not (i ->> 'required')::boolean), 1, 'IMP-13: an unconfirmed charge is a suggestion, not a blocker');
delete from public.listing_charges where listing_id = (select v::uuid from ctx where k = 'monthly') and kind = 'garbage';
select set_config('request.jwt.claims', '{"sub":"c6666666-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.listing_problem_items((select v::uuid from ctx where k = 'monthly')) $$, 'P0001', null,
  'IMP-13: someone without listing access cannot read the checklist');
reset role;

-- Publish both (rows only; photos and review as in 03_marketplace).
insert into public.listing_photos (listing_id, org_id, storage_path, position)
select l.id, l.org_id, l.org_id || '/' || l.id || '/p' || g || '.jpg', g
from public.listings l, generate_series(1, 4) g where l.org_id = (select v::uuid from ctx where k = 'org');
select set_config('request.jwt.claims', '{"sub":"a6666666-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.submit_listing(id) from public.listings where org_id = (select v::uuid from ctx where k = 'org');
reset role;
select set_config('request.jwt.claims', '{"sub":"c6666666-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.admin_review_listing(id, 'publish', null) from public.listings where org_id = (select v::uuid from ctx where k = 'org');
reset role;

set local role anon;
select is((select count(*)::int from public.search_listings('{"q":"Costville"}'::jsonb)), 2, 'Without a budget both homes are listed');
select is((select string_agg(title, ', ') from public.search_listings('{"q":"Costville","max_rent":20000}'::jsonb)), 'Monthly bedsitter',
  'A monthly budget compares monthly prices only; the nightly home is not converted or compared');
select is((select string_agg(title, ', ') from public.search_listings('{"q":"Costville","max_rent":20000,"budget_basis":"fixed"}'::jsonb)), 'Monthly bedsitter',
  'The same holds for a budget on rent plus fixed charges');
select is((select string_agg(title, ', ' order by null) from public.search_listings('{"q":"Costville","sort":"lowest_total"}'::jsonb)),
  'Monthly bedsitter, Nightly bedsitter', 'Lowest monthly total lists monthly prices first, not the cheap-looking nightly rate');

-- AI search (AIS-03): move-in budgets, strict totals and preferences -----------------------
reset role;
set local role anon;
select is((select string_agg(title, ', ') from public.search_listings('{"q":"Costville","max_rent":30000,"budget_basis":"movein"}'::jsonb)), 'Monthly bedsitter',
  'A move-in budget compares the move-in total (29,000 fits 30,000)');
select is((select count(*)::int from public.search_listings('{"q":"Costville","max_rent":28000,"budget_basis":"movein"}'::jsonb)), 0,
  'A move-in total above the budget is excluded, never read as monthly rent');
reset role;
insert into public.listing_charges (listing_id, kind, amount, frequency, billing) values
  ((select v::uuid from ctx where k = 'monthly'), 'garbage', null, 'monthly', 'fixed');
set local role anon;
select is((select count(*)::int from public.search_listings('{"q":"Costville","max_rent":20000,"budget_basis":"fixed"}'::jsonb)), 0,
  'An unconfirmed compulsory charge means the total is not proven to fit a total budget');
select is((select count(*)::int from public.search_listings('{"q":"Costville","max_rent":20000,"budget_basis":"fixed","include_unconfirmed":true}'::jsonb)), 1,
  'It is included only when the tenant includes unconfirmed answers');
select is((select count(*)::int from public.search_listings('{"q":"Costville","max_rent":20000}'::jsonb)), 1,
  'A rent-only budget is unaffected by an unconfirmed charge');
reset role;
delete from public.listing_charges where listing_id = (select v::uuid from ctx where k = 'monthly') and kind = 'garbage';
-- Preferences rank but never filter: give only the nightly home parking.
update public.listings set price_period = 'month', rent_amount = 9000, deposit_amount = 0 where id = (select v::uuid from ctx where k = 'nightly');
update public.units set facts = facts || '{"parking":"yes"}'::jsonb where id = (select unit_id from public.listings where id = (select v::uuid from ctx where k = 'nightly'));
set local role anon;
select is((select string_agg(title, ', ') from public.search_listings('{"q":"Costville"}'::jsonb)), 'Monthly bedsitter, Nightly bedsitter',
  'Without a preference the usual order applies');
select is((select string_agg(title, ', ') from public.search_listings('{"q":"Costville","preferred":["parking"]}'::jsonb)), 'Nightly bedsitter, Monthly bedsitter',
  'A preferred feature moves matching homes up');
select is((select count(*)::int from public.search_listings('{"q":"Costville","preferred":["parking"]}'::jsonb)), 2,
  'A preferred feature never removes homes without it');
reset role;

-- AIS-07: daily caps are enforced atomically on the server.
delete from public.ai_client_daily;
delete from public.ai_usage_daily;
set local role service_role;
select is(array[public.ai_take('search_intent', 'client-aaaaaaaaaaaaaaaa', 2, 100), public.ai_take('search_intent', 'client-aaaaaaaaaaaaaaaa', 2, 100),
  public.ai_take('search_intent', 'client-aaaaaaaaaaaaaaaa', 2, 100), public.ai_take('search_intent', 'client-bbbbbbbbbbbbbbbb', 2, 3),
  public.ai_take('search_intent', 'client-cccccccccccccccc', 2, 3)], array['ok', 'ok', 'client_limit', 'ok', 'global_limit'],
  'Per-visitor and global daily caps stop requests before the provider is called');
reset role;

select * from finish();
rollback;
