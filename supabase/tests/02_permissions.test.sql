-- Property-scoped authorization and team administration.
-- "Manager cannot open another property's records through the UI, direct URL, API or
-- private-file link." Every check here goes through the same RLS policies and RPC checks
-- the app uses (PostgREST runs queries as the `authenticated` role with the user's JWT).

begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1111111-0000-0000-0000-000000000001', 'owner-a@example.test', '{"full_name":"Owner A"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b2222222-0000-0000-0000-000000000002', 'owner-b@example.test', '{"full_name":"Owner B"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c3333333-0000-0000-0000-000000000003', 'manager@example.test', '{"full_name":"Mary Manager"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d4444444-0000-0000-0000-000000000004', 'caretaker@example.test', '{"full_name":"Carl Caretaker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('e5555555-0000-0000-0000-000000000005', 'admin@example.test', '{"full_name":"Platform Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('f6666666-0000-0000-0000-000000000006', 'stranger@example.test', '{"full_name":"Someone Else"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('e5555555-0000-0000-0000-000000000005');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- Owner A: two properties, a tenancy, an entry and private evidence on each ---------------
select set_config('request.jwt.claims', '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('orgA', public.create_workspace('Owner A Homes', 'landlord'));
insert into public.properties (id, org_id, name, area) values
  ('a0000000-0000-0000-0000-0000000000a1', (select v::uuid from ctx where k = 'orgA'), 'Assigned Court', 'Ruaka'),
  ('a0000000-0000-0000-0000-0000000000a2', (select v::uuid from ctx where k = 'orgA'), 'Other Court', 'Kilimani');
insert into public.units (id, org_id, property_id, label) values
  ('a0000000-0000-0000-0000-00000000a101', (select v::uuid from ctx where k = 'orgA'), 'a0000000-0000-0000-0000-0000000000a1', 'A1'),
  ('a0000000-0000-0000-0000-00000000a201', (select v::uuid from ctx where k = 'orgA'), 'a0000000-0000-0000-0000-0000000000a2', 'B1');
insert into ctx values ('tenA1', public.create_tenancy('{"unit_id":"a0000000-0000-0000-0000-00000000a101","tenant_name":"Tenant One","start_date":"2026-01-01","rent_amount":12000}'::jsonb));
insert into ctx values ('tenA2', public.create_tenancy('{"unit_id":"a0000000-0000-0000-0000-00000000a201","tenant_name":"Tenant Two","start_date":"2026-01-01","rent_amount":20000}'::jsonb));
select public.generate_rent_charges('a0000000-0000-0000-0000-0000000000a1', '2026-09-01');
select public.generate_rent_charges('a0000000-0000-0000-0000-0000000000a2', '2026-09-01');
insert into ctx values ('entryA2', public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'tenA2'), 'amount', 20000, 'paid_on', '2026-09-03', 'allocations', '[]'::jsonb, 'action', 'draft')) ->> 'id');

insert into ctx values ('inv_mgr', public.invite_member((select v::uuid from ctx where k = 'orgA'), jsonb_build_object(
  'display_name', 'Mary Manager', 'email', 'manager@example.test', 'role', 'manager',
  'property_ids', jsonb_build_array('a0000000-0000-0000-0000-0000000000a1'),
  'can_enter_payments', true, 'can_confirm', true)) ->> 'token');
insert into ctx values ('inv_care', public.invite_member((select v::uuid from ctx where k = 'orgA'), jsonb_build_object(
  'display_name', 'Carl Caretaker', 'email', 'caretaker@example.test', 'role', 'caretaker',
  'property_ids', jsonb_build_array('a0000000-0000-0000-0000-0000000000a1'), 'can_enter_payments', true)) ->> 'token');

-- Evidence object rows for each property (simulating completed uploads).
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values ('private-docs', (select v from ctx where k = 'orgA') || '/a0000000-0000-0000-0000-0000000000a2/' || (select v from ctx where k = 'entryA2') || '/receipt.jpg', 'a1111111-0000-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.register_attachment(jsonb_build_object('entry_id', (select v from ctx where k = 'entryA2'),
  'storage_path', (select v from ctx where k = 'orgA') || '/a0000000-0000-0000-0000-0000000000a2/' || (select v from ctx where k = 'entryA2') || '/receipt.jpg',
  'file_name', 'receipt.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 1000)) $$, 'Owner registers private evidence on property A2');

-- Owner B: a separate workspace --------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('orgB', public.create_workspace('Owner B Agency', 'agency'));
insert into public.properties (id, org_id, name, area) values
  ('b0000000-0000-0000-0000-0000000000b1', (select v::uuid from ctx where k = 'orgB'), 'B Towers', 'Westlands');

select is((select count(*)::int from public.properties where org_id = (select v::uuid from ctx where k = 'orgA')), 0,
  'Owner B cannot see Owner A''s properties');
select is((select count(*)::int from public.tenancies), 0, 'Owner B cannot see Owner A''s tenancies');
select is((select count(*)::int from public.payment_entries), 0, 'Owner B cannot see Owner A''s payment entries');
select throws_like($$ select public.generate_rent_charges('a0000000-0000-0000-0000-0000000000a1', '2026-10-01') $$, '%permission%',
  'Owner B cannot act on Owner A''s property through the API');
select throws_like($$ insert into public.properties (org_id, name, area) values ((select v::uuid from ctx where k = 'orgA'), 'Sneaky', 'X') $$,
  '%row-level security%', 'Owner B cannot add a property to Owner A''s workspace');

-- Manager accepts; sees only the assigned property ---------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"c3333333-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.properties), 0, 'Before accepting, the invitee sees nothing');
select lives_ok($$ select public.accept_invitation((select v from ctx where k = 'inv_mgr')) $$, 'Manager accepts the invitation');
select is((select count(*)::int from public.profiles where email = 'manager@example.test'), 1, 'No duplicate identity was created');
select is((select array_agg(name order by name) from public.properties), array['Assigned Court'], 'Manager sees only the assigned property');
select is((select count(*)::int from public.tenancies where property_id = 'a0000000-0000-0000-0000-0000000000a2'), 0, 'Manager cannot read tenancies of an unassigned property');
select is((select count(*)::int from public.rent_charges where property_id = 'a0000000-0000-0000-0000-0000000000a2'), 0, 'Manager cannot read charges of an unassigned property');
select is((select count(*)::int from public.payment_entries where id = (select v::uuid from ctx where k = 'entryA2')), 0, 'Manager cannot open an entry from another property by id');
select is((select count(*)::int from public.rent_register('a0000000-0000-0000-0000-0000000000a2', '2026-09-01')), 0, 'The register function returns nothing for an unassigned property');
select throws_like($$ select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'tenA2'), 'amount', 100, 'paid_on', '2026-09-03', 'allocations', '[]'::jsonb, 'action', 'draft')) $$,
  '%permission%', 'Manager cannot record a payment on an unassigned property');
select throws_like($$ select public.decide_entry((select v::uuid from ctx where k = 'entryA2'), 'confirm', null, true) $$,
  '%permission%', 'Manager cannot confirm an entry on an unassigned property');
select is((select count(*)::int from public.attachments), 0, 'Manager cannot see another property''s attachments');
select is((select count(*)::int from storage.objects where bucket_id = 'private-docs'), 0, 'Manager cannot read another property''s private files');
select is((select count(*)::int from public.memberships), 1, 'Manager sees only their own membership, not colleagues'' access');
select throws_like($$ select public.invite_member((select v::uuid from ctx where k = 'orgA'), '{"display_name":"X Y","email":"x@example.test","role":"manager","property_ids":["a0000000-0000-0000-0000-0000000000a1"]}'::jsonb) $$,
  '%Only the workspace owner%', 'Managers cannot invite staff');
select throws_like($$ select public.update_member_access((select id from public.memberships where user_id = auth.uid()), '{"role":"manager","all_properties":true,"can_correct":true}'::jsonb) $$,
  '%Only the workspace owner%', 'Managers cannot grant themselves more authority');
select throws_like($$ update public.memberships set can_correct = true where user_id = auth.uid() $$, '%permission denied%',
  'Memberships cannot be changed directly through the API');
select lives_ok($$ select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'tenA1'), 'amount', 12000, 'paid_on', '2026-09-03',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from public.rent_charges where tenancy_id = (select v::uuid from ctx where k = 'tenA1')), 'amount', 12000)),
  'action', 'confirm', 'acknowledged', true)) $$, 'Manager can record and confirm on the assigned property');

-- Caretaker: submit only -----------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"d4444444-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.accept_invitation((select v from ctx where k = 'inv_care')) $$, 'Caretaker accepts');
insert into ctx values ('careEntry', public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'tenA1'), 'amount', 500, 'paid_on', '2026-09-05', 'allocations', '[]'::jsonb, 'action', 'submit')) ->> 'id');
select throws_like($$ select public.decide_entry((select v::uuid from ctx where k = 'careEntry'), 'confirm', null, true) $$, '%permission%',
  'A caretaker cannot confirm, even their own submission');
select throws_like($$ select public.reverse_entry((select id from public.payment_entries where status = 'confirmed' limit 1), 'test') $$, '%permission%',
  'A caretaker cannot reverse a confirmed record');

-- Invitation edge cases ------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"f6666666-0000-0000-0000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.accept_invitation((select v from ctx where k = 'inv_mgr')) $$, '%not valid%',
  'A used invitation link cannot be reused (its token is cleared on acceptance)');

reset role;
select set_config('request.jwt.claims', '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('inv_x', public.invite_member((select v::uuid from ctx where k = 'orgA'), '{"display_name":"Xavier","email":"xavier@example.test","role":"viewer","all_properties":true}'::jsonb) ->> 'token');
reset role;
select set_config('request.jwt.claims', '{"sub":"f6666666-0000-0000-0000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.accept_invitation((select v from ctx where k = 'inv_x')) $$, '%different email%',
  'An invitation cannot be accepted by a different account');
reset role;
update public.memberships set invite_expires_at = now() - interval '1 minute' where invited_email = 'xavier@example.test';
select set_config('request.jwt.claims', '{"sub":"f6666666-0000-0000-0000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select is((public.invitation_preview((select v from ctx where k = 'inv_x')) ->> 'state'), 'expired', 'Expired invitations are reported as expired');

-- Suspension takes effect on the very next request ----------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.team_overview((select v::uuid from ctx where k = 'orgA'))), 4, 'Owner sees the whole team, including the pending invitation');
select lives_ok($$ select public.set_member_status((select id from public.memberships where user_id = 'c3333333-0000-0000-0000-000000000003'), 'suspended',
  (select id from public.memberships where user_id = 'a1111111-0000-0000-0000-000000000001')) $$, 'Owner suspends the manager and reassigns open work');
select throws_like($$ select public.set_member_status((select id from public.memberships where user_id = auth.uid()), 'suspended') $$, '%cannot%',
  'The owner cannot suspend themselves');
reset role;
select set_config('request.jwt.claims', '{"sub":"c3333333-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.properties), 0, 'A suspended manager immediately loses read access');
select throws_like($$ select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'tenA1'), 'amount', 100, 'paid_on', '2026-09-03', 'allocations', '[]'::jsonb, 'action', 'draft')) $$,
  '%permission%', 'A suspended manager cannot write records');
reset role;
select is((select count(*)::int from public.payment_entries where confirmed_by = 'c3333333-0000-0000-0000-000000000003'), 1,
  'History created by the suspended manager is retained');

-- Platform admins have no routine access to rent records ---------------------------------
select set_config('request.jwt.claims', '{"sub":"e5555555-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.payment_entries), 0, 'Platform admins cannot read rent entries');
select is((select count(*)::int from public.tenancies), 0, 'Platform admins cannot read tenancies');
select ok((public.admin_queue_counts() ->> 'onboarding')::int >= 2, 'Platform admins can see the onboarding queue');

-- Signed-out visitors -------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_like($$ select count(*) from public.properties $$, '%permission denied%', 'Anonymous visitors cannot read properties');
select throws_like($$ select count(*) from public.payment_entries $$, '%permission denied%', 'Anonymous visitors cannot read payment entries');
select throws_like($$ select public.save_payment_entry('{}'::jsonb) $$, '%permission denied%', 'Anonymous visitors cannot call rent functions');
select is((select count(*)::int from storage.objects where bucket_id = 'private-docs'), 0, 'Anonymous visitors cannot read private files');

select * from finish();
rollback;
