-- IMP-15: "records last changed" moves only when the confirmed figures change, never on a
-- read, a draft or a submission. IMP-16: one definition of a person's rent work.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a7777777-0000-0000-0000-0000000000aa', 'owner7@example.test', '{"full_name":"Owner Seven"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b7777777-0000-0000-0000-0000000000bb', 'mgr7@example.test', '{"full_name":"Mary Manager"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c7777777-0000-0000-0000-0000000000cc', 'care7@example.test', '{"full_name":"Carl Caretaker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- Owner: property, one unit, one tenancy; invites a manager and a caretaker.
select set_config('request.jwt.claims', '{"sub":"a7777777-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Seven Homes', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('a7000000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Seven Court', 'Sevenville', 5);
insert into public.units (id, org_id, property_id, label, layout, default_rent)
values ('a7000000-0000-0000-0000-0000000000b1', (select v::uuid from ctx where k = 'org'), 'a7000000-0000-0000-0000-000000000001', 'S1', 'bedsitter_studio', 10000);
select public.create_tenancy(jsonb_build_object('unit_id', 'a7000000-0000-0000-0000-0000000000b1',
  'tenant_name', 'Tenant S1', 'start_date', '2026-01-01', 'rent_amount', 10000));
create temp table invites as
select 'mgr' as who, public.invite_member((select v::uuid from ctx where k = 'org'), jsonb_build_object(
  'display_name', 'Mary Manager', 'email', 'mgr7@example.test', 'role', 'manager',
  'property_ids', jsonb_build_array('a7000000-0000-0000-0000-000000000001'),
  'can_enter_payments', true, 'can_confirm', true)) as r
union all
select 'care', public.invite_member((select v::uuid from ctx where k = 'org'), jsonb_build_object(
  'display_name', 'Carl Caretaker', 'email', 'care7@example.test', 'role', 'caretaker',
  'property_ids', jsonb_build_array('a7000000-0000-0000-0000-000000000001'), 'can_enter_payments', true));
grant select on invites to authenticated;
reset role;

-- Nothing recorded yet: "never", not "now".
select is(public.records_changed_at((select v::uuid from ctx where k = 'org'), 'a7000000-0000-0000-0000-000000000001'), null::timestamptz,
  'IMP-15: with no charges or payments, records have never changed');

select set_config('request.jwt.claims', '{"sub":"a7777777-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.generate_rent_charges('a7000000-0000-0000-0000-000000000001', '2026-09-01');
reset role;
-- now() is fixed inside one transaction; date the charges an hour earlier to simulate time.
update public.rent_charges set created_at = created_at - interval '1 hour' where property_id = 'a7000000-0000-0000-0000-000000000001';
insert into ctx values ('after_charges', public.records_changed_at((select v::uuid from ctx where k = 'org'), 'a7000000-0000-0000-0000-000000000001')::text);
select isnt((select v from ctx where k = 'after_charges'), null, 'IMP-15: creating rent charges changes the records');

select set_config('request.jwt.claims', '{"sub":"b7777777-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.accept_invitation((select r ->> 'token' from invites where who = 'mgr'));
reset role;
select set_config('request.jwt.claims', '{"sub":"c7777777-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.accept_invitation((select r ->> 'token' from invites where who = 'care'));

-- The caretaker saves one draft and submits two entries.
create temp view charge as select c.id, c.tenancy_id from public.rent_charges c where c.unit_id = 'a7000000-0000-0000-0000-0000000000b1';
grant select on charge to authenticated;
insert into ctx values ('draft', (public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select tenancy_id from charge), 'amount', 2000, 'paid_on', '2026-09-03',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from charge), 'amount', 2000)), 'action', 'draft')) ->> 'id'));
insert into ctx values ('sub1', (public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select tenancy_id from charge), 'amount', 3000, 'paid_on', '2026-09-04',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from charge), 'amount', 3000)), 'action', 'submit')) ->> 'id'));
insert into ctx values ('sub2', (public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select tenancy_id from charge), 'amount', 4000, 'paid_on', '2026-09-05',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id', (select id from charge), 'amount', 4000)), 'action', 'submit')) ->> 'id'));
select is((select string_agg(grp, ',' order by grp) from public.my_rent_work((select v::uuid from ctx where k = 'org'))), 'drafts,submitted,submitted',
  'IMP-16: the caretaker sees one draft and two submitted entries');
reset role;

select is(public.records_changed_at((select v::uuid from ctx where k = 'org'), 'a7000000-0000-0000-0000-000000000001')::text, (select v from ctx where k = 'after_charges'),
  'IMP-15: drafts and submissions do not change the confirmed records');

-- The manager returns one and confirms the other.
select set_config('request.jwt.claims', '{"sub":"b7777777-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.decide_entry((select v::uuid from ctx where k = 'sub1'), 'return', 'Reference missing');
select public.decide_entry((select v::uuid from ctx where k = 'sub2'), 'confirm', null, true);
select is((select count(*)::int from public.my_rent_work((select v::uuid from ctx where k = 'org'))), 0,
  'IMP-16: the manager has no rent work of their own here');
reset role;

select ok(public.records_changed_at((select v::uuid from ctx where k = 'org'), 'a7000000-0000-0000-0000-000000000001') > (select v::timestamptz from ctx where k = 'after_charges'),
  'IMP-15: confirming a payment changes the records');

select set_config('request.jwt.claims', '{"sub":"c7777777-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select is((select string_agg(grp, ',' order by grp) from public.my_rent_work((select v::uuid from ctx where k = 'org'))), 'drafts,returned',
  'IMP-16: after the decisions the caretaker has a draft and a returned entry; the confirmed one left the list');
select is((select decision_reason from public.my_rent_work((select v::uuid from ctx where k = 'org')) where grp = 'returned'), 'Reference missing',
  'IMP-16: the returned entry carries the manager''s reason');
reset role;

-- Team and the caretaker's own list use the same definition.
select set_config('request.jwt.claims', '{"sub":"a7777777-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select is((select open_work || '/' || submitted_pending from public.team_overview((select v::uuid from ctx where k = 'org')) where display_name = 'Carl Caretaker'), '2/0',
  'IMP-16: Team shows the same 2 open items and nothing pending');
select is((select open_work from public.team_overview((select v::uuid from ctx where k = 'org')) where display_name = 'Mary Manager'), 0,
  'IMP-16: the manager has no open items');
select ok((select last_active_at is not null from public.team_overview((select v::uuid from ctx where k = 'org')) where display_name = 'Carl Caretaker'),
  'IMP-15: recording payments counts as the caretaker''s last action');
select is((select last_sign_in_at from public.team_overview((select v::uuid from ctx where k = 'org')) where display_name = 'Carl Caretaker'), null::timestamptz,
  'IMP-15: last sign-in comes from Auth and is shown as never here, not guessed from activity');
reset role;

-- Caretaker removed from the property: their work leaves their list (access now, not then).
delete from public.membership_properties where membership_id = (select id from public.memberships where user_id = 'c7777777-0000-0000-0000-0000000000cc');
select set_config('request.jwt.claims', '{"sub":"c7777777-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.my_rent_work((select v::uuid from ctx where k = 'org'))), 0,
  'IMP-16: after losing the property, its entries are no longer listed for them');
reset role;

select * from finish();
rollback;
