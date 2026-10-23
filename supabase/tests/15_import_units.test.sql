-- Spreadsheet import: dry runs change nothing, imports are all or nothing, every failing row
-- is reported, and the usual permission and tenancy rules apply.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1500000-0000-0000-0000-0000000000aa', 'owner15@example.test', '{"full_name":"Owner Fifteen"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d1500000-0000-0000-0000-0000000000dd', 'caretaker15@example.test', '{"full_name":"Caretaker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

select set_config('request.jwt.claims', '{"sub":"a1500000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Fifteen Estates', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('a1500000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Imani Flats', 'Rongai', 5);
insert into public.units (org_id, property_id, label, layout, default_rent)
values ((select v::uuid from ctx where k = 'org'), 'a1500000-0000-0000-0000-000000000001', 'A1', 'bedsitter_studio', 9000);
reset role;
insert into public.memberships (org_id, user_id, role, status, display_name, all_properties, can_enter_payments)
values ((select v::uuid from ctx where k = 'org'), 'd1500000-0000-0000-0000-0000000000dd', 'caretaker', 'active', 'Caretaker', true, true);

create temp table good as select jsonb_build_array(
  jsonb_build_object('row', 2, 'label', 'a1', 'tenant_name', 'Wanjiku M', 'tenant_phone', '0711000001', 'start_date', '2026-06-01', 'rent_amount', '9000'),
  jsonb_build_object('row', 3, 'label', 'A2', 'layout', 'bedsitter_studio', 'tenant_name', 'Otieno K', 'start_date', '2026-07-01', 'rent_amount', '9500',
    'opening_balance', '4500', 'opening_balance_note', 'Arrears at cut-off'),
  jsonb_build_object('row', 4, 'label', 'B1', 'layout', 'bedroom_home', 'bedrooms', '2', 'default_rent', '18000')) as rows;
grant select on good to authenticated;

select set_config('request.jwt.claims', '{"sub":"d1500000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.import_units('a1500000-0000-0000-0000-000000000001', (select rows from good), true) $$,
  '%permission%', 'Staff without tenancy permission cannot import');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1500000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
-- Dry run --------------------------------------------------------------------------------------
select is((select r - 'rows' from (select public.import_units('a1500000-0000-0000-0000-000000000001', (select rows from good), false) r) x),
  '{"errors": [], "committed": false, "units_created": 2, "tenancies_created": 2}'::jsonb,
  'A check reports what an import would do: the existing A1 is reused, A2 and B1 are new');
select is((select count(*)::int from public.units where property_id = 'a1500000-0000-0000-0000-000000000001'), 1, 'and changes nothing');
select is((select count(*)::int from public.tenancies), 0, 'not even tenancies');

-- A file with problems ----------------------------------------------------------------------------
select is((select r -> 'errors' from (select public.import_units('a1500000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('row', 2, 'label', 'C1', 'tenant_name', 'Ok Tenant', 'start_date', '2026-06-01', 'rent_amount', '7000'),
  jsonb_build_object('row', 3, 'label', 'C2', 'tenant_name', 'No Rent', 'start_date', '2026-06-01'),
  jsonb_build_object('row', 4, 'label', 'c1'),
  jsonb_build_object('row', 5, 'label', 'C3', 'layout', 'castle'),
  jsonb_build_object('row', 6, 'label', 'C4', 'tenant_name', 'Owes', 'start_date', '2026-06-01', 'rent_amount', '7000', 'opening_balance', '100')
), true) r) x),
  '[{"row": 3, "message": "Enter the monthly rent in KSh."},
    {"row": 4, "message": "Unit c1 appears more than once in the file."},
    {"row": 5, "message": "A value in this row isn''t allowed. Check the unit type, numbers and dates."},
    {"row": 6, "message": "Explain the opening balance, for example \"Arrears at 30 Sep cut-off\"."}]'::jsonb,
  'Every failing row is reported with its row number and a plain reason');
select is((select count(*)::int from public.units where label like 'C%'), 0, 'and nothing from that file is kept, not even the good rows');

-- The real import ---------------------------------------------------------------------------------
select is((public.import_units('a1500000-0000-0000-0000-000000000001', (select rows from good), true) ->> 'committed')::boolean, true,
  'A clean file imports');
select is((select string_agg(label || ':' || occupancy, ',' order by label) from public.units where property_id = 'a1500000-0000-0000-0000-000000000001'),
  'A1:occupied,A2:occupied,B1:vacant', 'Units with a tenant are occupied; B1 is added empty');
select is((select bedrooms || ' ' || default_rent from public.units where label = 'B1'), '2 18000.00', 'with its layout details');
select is((select tenant_name from public.rent_register('a1500000-0000-0000-0000-000000000001', '2026-07-01') where unit_label = 'A2'), 'Otieno K',
  'Imported tenancies appear in the rent register like ones made by hand');
select is((select sum(amount) from public.rent_charges where category = 'opening_balance'), 4500.00::numeric, 'Opening balances are recorded');
select throws_ok($$ select public.import_units('a1500000-0000-0000-0000-000000000001', '[]', false) $$, 'P0001', 'The file has no rows to import.',
  'An empty file is refused');
reset role;

select * from finish();
rollback;
