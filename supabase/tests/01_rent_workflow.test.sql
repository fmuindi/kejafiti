-- Rent calculations and confirmation workflow.
-- Mirrors the blueprint's acceptance tests and the "Sunrise Apartments" worked example:
-- 10 units, 9 occupied at KSh 15,000; 6 fully paid, 2 partly paid (10,000 each), 1 unpaid,
-- 1 vacant. Expected: billed 135,000, confirmed 110,000, outstanding 25,000, 81.5%, 9/10.

begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- People -------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111', 'felix@example.test', '{"full_name":"Felix M"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'esther@example.test', '{"full_name":"Esther W"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('33333333-3333-3333-3333-333333333333', 'joseph@example.test', '{"full_name":"Joseph K"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('44444444-4444-4444-4444-444444444444', 'brian@example.test', '{"full_name":"Brian O"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- Owner sets up the workspace, property, units and tenancies ----------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

insert into ctx values ('org', public.create_workspace('Felix Properties', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('aaaaaaaa-0000-0000-0000-000000000001', (select v from ctx where k = 'org'), 'Sunrise Apartments', 'Ruaka', 5);

insert into public.units (id, org_id, property_id, label, layout, default_rent)
select ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, (select v from ctx where k = 'org'),
       'aaaaaaaa-0000-0000-0000-000000000001', 'U' || g, 'bedsitter_studio', 15000
from generate_series(1, 10) g;

-- Nine tenancies (U1..U9) starting in January; U10 stays vacant.
select public.create_tenancy(jsonb_build_object(
  'unit_id', ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0')),
  'tenant_name', 'Tenant ' || g, 'start_date', '2026-01-01', 'rent_amount', 15000))
from generate_series(1, 9) g;

select is(public.generate_rent_charges('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01'), 9,
  'Nine September rent charges are created for the nine occupied units');
select is(public.generate_rent_charges('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01'), 0,
  'Creating charges again is idempotent');

-- Owner invites Esther (manager, can confirm), Joseph (caretaker, submit only) and Brian
-- (second manager, can confirm).
create temp table invites as
select 'esther' as who, public.invite_member((select v from ctx where k = 'org'), jsonb_build_object(
  'display_name', 'Esther W', 'email', 'esther@example.test', 'role', 'manager',
  'property_ids', jsonb_build_array('aaaaaaaa-0000-0000-0000-000000000001'),
  'can_enter_payments', true, 'can_confirm', true, 'can_correct', true, 'can_manage_tenancies', true)) as r
union all
select 'joseph', public.invite_member((select v from ctx where k = 'org'), jsonb_build_object(
  'display_name', 'Joseph K', 'email', 'joseph@example.test', 'role', 'caretaker',
  'property_ids', jsonb_build_array('aaaaaaaa-0000-0000-0000-000000000001'), 'can_enter_payments', true))
union all
select 'brian', public.invite_member((select v from ctx where k = 'org'), jsonb_build_object(
  'display_name', 'Brian O', 'email', 'brian@example.test', 'role', 'manager',
  'property_ids', jsonb_build_array('aaaaaaaa-0000-0000-0000-000000000001'),
  'can_enter_payments', true, 'can_confirm', true));
grant select on invites to authenticated;

-- Helper: the September charge id for unit n.
create temp view sep_charge as
select u.label, c.id, c.tenancy_id from public.rent_charges c join public.units u on u.id = c.unit_id
where c.period_start = '2026-09-01' and c.category = 'rent';
grant select on sep_charge to authenticated;

-- Owner records the worked example directly (U1..U6 full, U7/U8 partial).
select public.save_payment_entry(jsonb_build_object(
  'client_request_id', gen_random_uuid(), 'tenancy_id', s.tenancy_id, 'amount', 15000, 'paid_on', '2026-09-04',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', s.id, 'amount', 15000)),
  'action', 'confirm', 'acknowledged', true))
from sep_charge s where s.label in ('U1', 'U2', 'U3', 'U4', 'U5', 'U6');
select public.save_payment_entry(jsonb_build_object(
  'client_request_id', gen_random_uuid(), 'tenancy_id', s.tenancy_id, 'amount', 10000, 'paid_on', '2026-09-04',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', s.id, 'amount', 10000)),
  'action', 'confirm', 'acknowledged', true))
from sep_charge s where s.label in ('U7', 'U8');

-- Worked example totals -------------------------------------------------------------------
select is((select billed from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 135000.00::numeric, 'Rent billed is 135,000');
select is((select settled from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 110000.00::numeric, 'Confirmed settled is 110,000');
select is((select outstanding from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 25000.00::numeric, 'Outstanding is 25,000');
select is((select collection_rate from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 81.5::numeric, 'Collection rate is 81.5%');
select is((select overdue from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 25000.00::numeric, 'All outstanding is overdue (past due date)');
select is((select occupied || '/' || lettable from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), '9/10', 'Occupancy is 9 of 10 lettable units');

select is((select rent_status from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U1'), 'paid', 'U1 is Paid');
select is((select rent_status from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U7'), 'partial', 'U7 is Partial');
select is((select outstanding from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U7'), 5000.00::numeric, 'U7 has KSh 5,000 left');
select is((select rent_status from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U9'), 'unpaid', 'U9 is Unpaid');
select ok((select overdue from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U9'), 'U9 is overdue');
select is((select rent_status from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U10'), 'vacant', 'U10 is Vacant, not an unpaid tenant');
select is((select billed from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U10'), 0::numeric, 'Vacant unit has no rent billed');

-- Staff accept their invitations ----------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.accept_invitation((select r ->> 'token' from invites where who = 'esther')) $$, 'Esther accepts her invitation');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.accept_invitation((select r ->> 'token' from invites where who = 'joseph')) $$, 'Joseph accepts his invitation');
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.accept_invitation((select r ->> 'token' from invites where who = 'brian')) $$, 'Brian accepts his invitation');

-- Caretaker submission stays pending and does not count -----------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select throws_like(
  $$ select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
       'tenancy_id', (select tenancy_id from sep_charge where label = 'U9'), 'amount', 10000, 'paid_on', '2026-09-20',
       'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from sep_charge where label = 'U9'), 'amount', 10000)),
       'action', 'confirm', 'acknowledged', true)) $$,
  '%permission%', 'A caretaker cannot confirm');

insert into ctx values ('req_u9', 'cccccccc-0000-0000-0000-000000000009');
select is((public.save_payment_entry(jsonb_build_object('client_request_id', (select v from ctx where k = 'req_u9'),
  'tenancy_id', (select tenancy_id from sep_charge where label = 'U9'), 'amount', 10000, 'paid_on', '2026-09-20',
  'method', 'mpesa', 'reference', 'SJF2K7Q9PL',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from sep_charge where label = 'U9'), 'amount', 10000)),
  'action', 'submit')) ->> 'status'), 'awaiting_confirmation', 'Caretaker submits an entry for confirmation');

select is((public.save_payment_entry(jsonb_build_object('client_request_id', (select v from ctx where k = 'req_u9'),
  'tenancy_id', (select tenancy_id from sep_charge where label = 'U9'), 'amount', 10000, 'paid_on', '2026-09-20',
  'allocations', '[]'::jsonb, 'action', 'submit')) ->> 'replayed')::boolean, true,
  'Retrying the same request returns the original entry');
select is((select count(*)::int from public.payment_entries where client_request_id = 'cccccccc-0000-0000-0000-000000000009'), 1,
  'The retry did not create a duplicate entry');

reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select settled from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 110000.00::numeric,
  'The pending entry does not increase confirmed collections');
select is((select pending_count || ':' || pending_amount from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')),
  '1:10000.00', 'The pending entry is shown separately');
select is((select pending_amount from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U9'), 10000.00::numeric,
  'U9 shows the pending amount in the register');

-- Confirm requires the external-check acknowledgement
insert into ctx values ('u9_entry', (select id from public.payment_entries where client_request_id = 'cccccccc-0000-0000-0000-000000000009'));
select throws_like($$ select public.decide_entry((select v from ctx where k = 'u9_entry'), 'confirm', null, false) $$,
  '%checked this payment%', 'Confirming requires the acknowledgement');
select throws_like($$ select public.decide_entry((select v from ctx where k = 'u9_entry'), 'return', '') $$,
  '%Explain what needs to change%', 'Returning requires a reason');

-- Esther confirms: worked example "what happens when the manager confirms that KSh 10,000"
select is((public.decide_entry((select v from ctx where k = 'u9_entry'), 'confirm', null, true) ->> 'status'), 'confirmed',
  'Authorised manager confirms the caretaker submission');
select is((select rent_status || ':' || outstanding from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U9'),
  'partial:5000.00', 'The unpaid unit becomes partially paid with KSh 5,000 remaining');
select is((select settled from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 120000.00::numeric, 'Confirmed allocations become 120,000');
select is((select outstanding from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 15000.00::numeric, 'Outstanding becomes 15,000');
select is((select collection_rate from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 88.9::numeric, 'Collection rate becomes 88.9%');
select is((select pending_count from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 0, 'The entry leaves the confirmation inbox');
select is((select count(*)::int from public.entry_events where entry_id = (select v from ctx where k = 'u9_entry') and action = 'confirmed' and actor_id = '22222222-2222-2222-2222-222222222222'),
  1, 'The activity log records who confirmed it');

-- Second reviewer cannot post the same payment again; first reviewer's retry is a no-op
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.decide_entry((select v from ctx where k = 'u9_entry'), 'confirm', null, true) $$,
  '%already confirmed by Esther W%', 'A second reviewer sees it was already confirmed');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((public.decide_entry((select v from ctx where k = 'u9_entry'), 'confirm', null, true) ->> 'replayed')::boolean, true,
  'Repeating the same confirmation is recognised as a retry');
select is((select count(*)::int from public.allocations where entry_id = (select v from ctx where k = 'u9_entry')), 1,
  'Allocations were posted exactly once');

-- Partial then full: 10,000 + 5,000 settles 15,000 ------------------------------------
select is((public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select tenancy_id from sep_charge where label = 'U9'), 'amount', 5000, 'paid_on', '2026-09-25',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from sep_charge where label = 'U9'), 'amount', 5000)),
  'action', 'confirm', 'acknowledged', true)) ->> 'status'), 'confirmed', 'Direct entry and confirmation in one action');
select is((select rent_status from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U9'), 'paid',
  'KSh 10,000 plus KSh 5,000 settles KSh 15,000 rent');
select is((select confirmed_by = recorded_by from public.payment_entries where tenancy_id = (select tenancy_id from sep_charge where label = 'U9') and amount = 5000),
  true, 'The same person is recorded as recorder and confirmer');

-- Over-allocation is rejected ---------------------------------------------------------------
select throws_like($$ select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select tenancy_id from sep_charge where label = 'U7'), 'amount', 9000, 'paid_on', '2026-09-25',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from sep_charge where label = 'U7'), 'amount', 9000)),
  'action', 'confirm', 'acknowledged', true)) $$, '%has only KSh 5,000 left%', 'Cannot apply more than a charge''s balance');
select throws_like($$ select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select tenancy_id from sep_charge where label = 'U7'), 'amount', 3000, 'paid_on', '2026-09-25',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from sep_charge where label = 'U7'), 'amount', 4000)),
  'action', 'draft')) $$, '%more than the payment%', 'Allocations cannot exceed the payment amount');

-- Multi-period allocation with retained credit -------------------------------------------
select is(public.generate_rent_charges('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01'), 9, 'October charges created');
create temp view oct_charge as
select u.label, c.id, c.tenancy_id from public.rent_charges c join public.units u on u.id = c.unit_id
where c.period_start = '2026-10-01' and c.category = 'rent';
grant select on oct_charge to authenticated;

insert into ctx values ('multi', ((public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select tenancy_id from sep_charge where label = 'U8'), 'amount', 22000, 'paid_on', '2026-10-02',
  'allocations', jsonb_build_array(
     jsonb_build_object('charge_id', (select id from sep_charge where label = 'U8'), 'amount', 5000),
     jsonb_build_object('charge_id', (select id from oct_charge where label = 'U8'), 'amount', 15000)),
  'action', 'confirm', 'acknowledged', true))) ->> 'id')::uuid);
select is((select outstanding from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U8'), 0.00::numeric, 'One payment settles September...');
select is((select rent_status from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01') where unit_label = 'U8'), 'credit', '...and October, with credit left over');
select is((select credit from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01') where unit_label = 'U8'), 2000.00::numeric, 'The KSh 2,000 remainder is kept as identifiable credit');

-- Correct a confirmed entry: original, reason and replacement remain traceable ---------
insert into ctx values ('u7_entry', (select e.id from public.payment_entries e where e.tenancy_id = (select tenancy_id from sep_charge where label = 'U7') and e.status = 'confirmed' limit 1));
select throws_like($$ update public.payment_entries set amount = 1 where id = (select v from ctx where k = 'u7_entry') $$, '%permission denied%',
  'Confirmed entries cannot be edited directly');
insert into ctx values ('u7_new', ((public.correct_entry((select v from ctx where k = 'u7_entry'), 'Entered 10,000 instead of 15,000',
  jsonb_build_object('client_request_id', gen_random_uuid(), 'amount', 15000, 'paid_on', '2026-09-04',
    'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from sep_charge where label = 'U7'), 'amount', 15000)),
    'acknowledged', true))) ->> 'id')::uuid);
select is((select status from public.payment_entries where id = (select v from ctx where k = 'u7_entry')), 'reversed', 'The original entry is kept as reversed');
select is((select replaces_entry_id from public.payment_entries where id = (select v from ctx where k = 'u7_new')), (select v from ctx where k = 'u7_entry'), 'The replacement links to the original');
select is((select rent_status from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01') where unit_label = 'U7'), 'paid', 'Balances reflect the correction');
select is((select settled from public.rent_summary((select v from ctx where k = 'org'), 'aaaaaaaa-0000-0000-0000-000000000001', '2026-09-01')), 135000.00::numeric,
  'Property totals update consistently after the correction');
select is((select count(*)::int from public.allocations where entry_id = (select v from ctx where k = 'u7_entry')), 2,
  'The reversal is a linked negative allocation; nothing was deleted');

-- Tenant moves out with arrears; the next tenant does not inherit them ------------------
select lives_ok($$ select public.end_tenancy((select tenancy_id from oct_charge where label = 'U9'), '2026-10-10', 'Moved out', 'vacant') $$, 'U9 tenancy ends');
select lives_ok($$ select public.create_tenancy(jsonb_build_object('unit_id', 'bbbbbbbb-0000-0000-0000-000000000009', 'tenant_name', 'New Tenant',
  'start_date', '2026-10-11', 'rent_amount', 16000)) $$, 'A new tenancy starts on the same unit');
select is((select count(*)::int from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01') where unit_label = 'U9'), 2,
  'October shows the former and the new tenancy separately');
select is((select outstanding from public.rent_register('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-01') where unit_label = 'U9' and tenancy_status = 'ended'), 15000.00::numeric,
  'The former tenancy keeps its own October arrears');

select * from finish();
rollback;
