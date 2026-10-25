-- Listing another unit in the same building: the building's details come from the latest (or
-- chosen) listing there, the unit's own details never do, and the location step is skipped.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a2000000-0000-0000-0000-0000000000aa', 'owner20@example.test', '{"full_name":"Owner Twenty"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Twenty Homes', 'landlord'));
insert into public.properties (id, org_id, name, area, landmark)
values ('a2000000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Mvuli Heights', 'Kahawa', 'Behind Quickmart'),
       ('a2000000-0000-0000-0000-000000000002', (select v::uuid from ctx where k = 'org'), 'Other Court', 'Thika', null);
insert into public.units (id, org_id, property_id, label, layout, facts) values
  ('a2000000-0000-0000-0000-0000000000f4', (select v::uuid from ctx where k = 'org'), 'a2000000-0000-0000-0000-000000000001', 'H4', 'bedsitter_studio', '{"parking":"no"}');

-- The first listing in the building, filled in by hand.
insert into ctx values ('first', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'property_id', 'a2000000-0000-0000-0000-000000000001', 'unit_label', 'H1', 'layout', 'bedsitter_studio')));
update public.listings set rent_amount = 12000, deposit_months = 2, contact_whatsapp = true, contact_phone = '0711000020',
  viewing_instructions = 'Ask for Mama Njeri at the gate', house_rules = 'No loud music after 10pm', furnishing = 'unfurnished',
  title = 'Bright bedsitter H1', description = 'H1 faces the garden.'
where id = (select v::uuid from ctx where k = 'first');
insert into public.listing_charges (listing_id, kind, label, amount, frequency, billing, compulsory, position) values
  ((select v::uuid from ctx where k = 'first'), 'service_charge', 'Security and garbage', 1000, 'monthly', 'fixed', true, 0),
  ((select v::uuid from ctx where k = 'first'), 'water', null, null, 'monthly', 'metered', true, 1);
update public.units set building_style = 'apartment',
  facts = '{"parking":"yes","lift":"no","borehole":"unknown","private_bathroom":"yes","balcony":"yes"}'
where id = (select unit_id from public.listings where id = (select v::uuid from ctx where k = 'first'));
-- Another building's listing, to make sure it can't be used here.
insert into ctx values ('elsewhere', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'property_id', 'a2000000-0000-0000-0000-000000000002', 'unit_label', 'T1', 'layout', 'bedsitter_studio')));

-- The next unit of the same kind ---------------------------------------------------------------
insert into ctx values ('second', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'property_id', 'a2000000-0000-0000-0000-000000000001', 'unit_label', 'H2', 'layout', 'bedsitter_studio')));
create temp table s as select l.*, u.facts, u.building_style from public.listings l join public.units u on u.id = l.unit_id
  where l.id = (select v::uuid from ctx where k = 'second');
select is((select copied_from from s), (select v::uuid from ctx where k = 'first'), 'A new listing in the building starts from the latest one there');
select is((select wizard_step from s), 2, 'and opens past the location, which the building already has');
select is((select contact_phone || ' ' || contact_whatsapp from s), '0711000020 true', 'Contact details are copied');
select is((select viewing_instructions from s), 'Ask for Mama Njeri at the gate', 'and the viewing instructions');
select is((select house_rules from s), 'No loud music after 10pm', 'and the house rules');
select is((select deposit_months from s), 2.00::numeric, 'and the deposit');
select is((select count(*)::int from public.listing_charges where listing_id = (select v::uuid from ctx where k = 'second')), 2,
  'Every extra charge is copied');
select is((select rent_amount from s), 12000.00::numeric, 'The rent is suggested for a unit of the same kind');
select is((select facts from s), '{"parking":"yes","lift":"no"}'::jsonb,
  'Only building features are copied: not the unit''s bathroom or balcony, and not unknown answers');
select is((select building_style from s), 'apartment', 'and the building style');
select ok((select title is null and description is null from s), 'The title and description are the unit''s own and never copied');

-- Other cases ----------------------------------------------------------------------------------
insert into ctx values ('bigger', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'property_id', 'a2000000-0000-0000-0000-000000000001', 'unit_label', 'H3', 'layout', 'bedroom_home', 'bedrooms', 2)));
select is((select rent_amount from public.listings where id = (select v::uuid from ctx where k = 'bigger')), null,
  'A different kind of unit gets no rent suggestion');
insert into ctx values ('existing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'unit_id', 'a2000000-0000-0000-0000-0000000000f4')));
select is((select facts ->> 'parking' from public.units where id = 'a2000000-0000-0000-0000-0000000000f4'), 'no',
  'A unit''s own answer is never overwritten');
insert into ctx values ('blank', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'property_id', 'a2000000-0000-0000-0000-000000000001', 'unit_label', 'H5', 'copy_from', 'none')));
select ok((select copied_from is null and house_rules is null and wizard_step = 2 from public.listings where id = (select v::uuid from ctx where k = 'blank')),
  'Start blank copies nothing but still skips the saved location');
insert into ctx values ('chosen', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'property_id', 'a2000000-0000-0000-0000-000000000001', 'unit_label', 'H6', 'copy_from', (select v from ctx where k = 'first'))));
select is((select copied_from from public.listings where id = (select v::uuid from ctx where k = 'chosen')), (select v::uuid from ctx where k = 'first'),
  'A specific earlier listing can be chosen');
select throws_like($$ select public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'property_id', 'a2000000-0000-0000-0000-000000000001', 'unit_label', 'H7', 'copy_from', (select v from ctx where k = 'elsewhere'))) $$,
  '%from this building%', 'but never one from another building');
insert into ctx values ('newhome', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Kitengela', 'unit_label', 'Main')));
select ok((select copied_from is null and wizard_step = 1 from public.listings where id = (select v::uuid from ctx where k = 'newhome')),
  'A brand-new home starts at the location step with nothing copied');
select is((select copied_from from public.listings where id = (select v::uuid from ctx where k = 'first')), null,
  'The first listing in a building had nothing to copy');
reset role;

select * from finish();
rollback;
