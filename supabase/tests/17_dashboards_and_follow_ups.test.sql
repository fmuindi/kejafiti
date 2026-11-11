-- Dashboards: who owes (credit counts, pending doesn't), the property position, scoped search,
-- and follow-ups that lead from a balance to an action without changing it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1700000-0000-0000-0000-0000000000aa', 'owner17@example.test', '{"full_name":"Owner Seventeen"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c1700000-0000-0000-0000-0000000000cc', 'caretaker17@example.test', '{"full_name":"Care Taker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d1700000-0000-0000-0000-0000000000dd', 'viewer17@example.test', '{"full_name":"View Only"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('e1700000-0000-0000-0000-0000000000ee', 'outsider17@example.test', '{"full_name":"Out Sider"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- Three tenancies in September: Amina paid 5,000 of 12,000; Baraka paid in full but the payment
-- wasn't allocated (credit); Chui paid nothing but has 12,000 submitted, awaiting confirmation.
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Seventeen Homes', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('a1700000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Mvule Court', 'Ruaka', 5);
insert into public.units (id, org_id, property_id, label, layout, default_rent) values
  ('a1700000-0000-0000-0000-0000000000f1', (select v::uuid from ctx where k = 'org'), 'a1700000-0000-0000-0000-000000000001', 'M1', 'bedsitter_studio', 12000),
  ('a1700000-0000-0000-0000-0000000000f2', (select v::uuid from ctx where k = 'org'), 'a1700000-0000-0000-0000-000000000001', 'M2', 'bedsitter_studio', 12000),
  ('a1700000-0000-0000-0000-0000000000f3', (select v::uuid from ctx where k = 'org'), 'a1700000-0000-0000-0000-000000000001', 'M3', 'bedsitter_studio', 12000);
insert into ctx values ('amina', public.create_tenancy(jsonb_build_object('unit_id', 'a1700000-0000-0000-0000-0000000000f1',
  'tenant_name', 'Amina Wairimu', 'tenant_phone', '0722 123 456', 'start_date', '2026-09-01', 'rent_amount', 12000)));
insert into ctx values ('baraka', public.create_tenancy(jsonb_build_object('unit_id', 'a1700000-0000-0000-0000-0000000000f2',
  'tenant_name', 'Baraka Otieno', 'start_date', '2026-09-01', 'rent_amount', 12000)));
insert into ctx values ('chui', public.create_tenancy(jsonb_build_object('unit_id', 'a1700000-0000-0000-0000-0000000000f3',
  'tenant_name', 'Chui Mwangi', 'start_date', '2026-09-01', 'rent_amount', 12000)));
select public.generate_rent_charges('a1700000-0000-0000-0000-000000000001', '2026-09-01');
select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'amina'), 'amount', 5000, 'paid_on', '2026-09-03', 'reference', 'QX7AMINA',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id',
    (select id from public.rent_charges where tenancy_id = (select v::uuid from ctx where k = 'amina')), 'amount', 5000)),
  'action', 'confirm', 'acknowledged', true));
select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'baraka'), 'amount', 12000, 'paid_on', '2026-09-02',
  'allocations', '[]'::jsonb, 'action', 'confirm', 'acknowledged', true));
reset role;
insert into public.memberships (org_id, user_id, role, status, display_name, all_properties, can_enter_payments)
values ((select v::uuid from ctx where k = 'org'), 'c1700000-0000-0000-0000-0000000000cc', 'caretaker', 'active', 'Care Taker', true, true),
       ((select v::uuid from ctx where k = 'org'), 'd1700000-0000-0000-0000-0000000000dd', 'viewer', 'active', 'View Only', true, false);
select set_config('request.jwt.claims', '{"sub":"c1700000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'chui'), 'amount', 12000, 'paid_on', '2026-09-04',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id',
    (select id from public.rent_charges where tenancy_id = (select v::uuid from ctx where k = 'chui')), 'amount', 12000)),
  'action', 'submit'));
reset role;

-- Who owes ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select is((select owed from public.owing_tenancies((select v::uuid from ctx where k = 'org')) where unit_label = 'M1'), 7000.00::numeric,
  'A part-paid tenant owes the unpaid part of what is due');
select is((select count(*)::int from public.owing_tenancies((select v::uuid from ctx where k = 'org')) where unit_label = 'M2'), 0,
  'A tenant whose payment covers the charge as credit owes nothing');
select is((select owed::text || ' ' || pending_amount::text from public.owing_tenancies((select v::uuid from ctx where k = 'org')) where unit_label = 'M3'),
  '12000.00 12000.00', 'A submitted payment is shown beside the debt but settles nothing');
select is((select owed_now::text || ' ' || owing_tenancies || ' ' || billed::text || ' ' || settled::text
  from public.portfolio_position((select v::uuid from ctx where k = 'org'), '2026-09-01')),
  '19000.00 2 36000.00 5000.00', 'The property position: owed now, who owes, billed and covered for the period');
reset role;
select set_config('request.jwt.claims', '{"sub":"e1700000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.owing_tenancies((select v::uuid from ctx where k = 'org'))), 0, 'Someone outside the workspace sees nobody owing');
select is((select count(*)::int from public.portfolio_position((select v::uuid from ctx where k = 'org'), '2026-09-01')), 0, 'and no properties');
select is((select count(*)::int from public.workspace_search((select v::uuid from ctx where k = 'org'), 'M1')), 0, 'and finds nothing by search');
reset role;

-- Search ----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d1700000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
select is((select title from public.workspace_search((select v::uuid from ctx where k = 'org'), 'm1') limit 1), 'Unit M1 · Amina Wairimu',
  'Search finds a unit by its label, with the tenant');
select is((select title from public.workspace_search((select v::uuid from ctx where k = 'org'), '123456') limit 1), 'Unit M1 · Amina Wairimu',
  'by the tenant''s phone digits');
select is((select kind || ' ' || detail from public.workspace_search((select v::uuid from ctx where k = 'org'), 'qx7amina') limit 1),
  'payment Unit M1 · Mvule Court · confirmed', 'and a payment by its M-PESA or bank reference');
select is((select count(*)::int from public.workspace_search((select v::uuid from ctx where k = 'org'), '%%')), 0,
  'Wildcards are searched for literally, never as "everything"');
select is((select count(*)::int from public.workspace_search((select v::uuid from ctx where k = 'org'), 'm')), 0,
  'One character is too short to search');

-- Follow-ups -----------------------------------------------------------------------------------
select throws_like($$ select public.add_follow_up(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'amina'), 'kind', 'contacted')) $$,
  '%rent or tenancy permission%', 'View-only staff cannot add follow-ups');
reset role;
select set_config('request.jwt.claims', '{"sub":"c1700000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.add_follow_up(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'amina'), 'kind', 'promised')) $$,
  '%promised to pay by%', 'A promise to pay needs a date');
select throws_like($$ select public.add_follow_up(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'amina'), 'kind', 'note')) $$,
  '%Write the note%', 'A note needs words');
select throws_like($$ select public.add_follow_up(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'amina'), 'kind', 'contacted', 'assigned_to', 'e1700000-0000-0000-0000-0000000000ee')) $$,
  '%isn''t on the team%', 'A follow-up can''t be given to someone outside the team');
insert into ctx values ('fu_req', gen_random_uuid()::text);
insert into ctx values ('fu', public.add_follow_up(jsonb_build_object('client_request_id', (select v from ctx where k = 'fu_req'),
  'tenancy_id', (select v from ctx where k = 'amina'), 'kind', 'promised', 'due_on', (current_date + 3)::text,
  'promised_amount', 7000, 'note', 'Will pay on Friday', 'assigned_to', 'a1700000-0000-0000-0000-0000000000aa'))::text);
select is(public.add_follow_up(jsonb_build_object('client_request_id', (select v from ctx where k = 'fu_req'),
  'tenancy_id', (select v from ctx where k = 'amina'), 'kind', 'promised', 'due_on', (current_date + 3)::text))::text,
  (select v from ctx where k = 'fu'), 'Retrying the same follow-up returns the one already added');
select is((select open_follow_ups || ' ' || next_follow_up::text || ' ' || last_contact_kind
  from public.owing_tenancies((select v::uuid from ctx where k = 'org')) where unit_label = 'M1'),
  '1 ' || (current_date + 3)::text || ' promised', 'Who owes shows the open follow-up and when it is due');
select is((select owed from public.owing_tenancies((select v::uuid from ctx where k = 'org')) where unit_label = 'M1'), 7000.00::numeric,
  'A promise to pay doesn''t change what is owed');
reset role;
select is((select title from public.notifications where user_id = 'a1700000-0000-0000-0000-0000000000aa' and kind = 'tenancy_follow_up'),
  'Follow-up assigned to you', 'The person it is assigned to is told');
select is((select count(*)::int from public.rent_follow_ups where id = (select v::uuid from ctx where k = 'fu')), 1, 'and it is kept once');

select set_config('request.jwt.claims', '{"sub":"c1700000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.resolve_follow_up((select v::uuid from ctx where k = 'fu'), 'Paid; entry submitted') $$, 'A follow-up is closed with its outcome');
select lives_ok($$ select public.resolve_follow_up((select v::uuid from ctx where k = 'fu'), 'again') $$, 'and closing it twice is harmless');
reset role;
select is((select resolution from public.rent_follow_ups where id = (select v::uuid from ctx where k = 'fu')), 'Paid; entry submitted',
  'The first outcome is kept');
select set_config('request.jwt.claims', '{"sub":"e1700000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.rent_follow_ups), 0, 'Follow-up notes stay inside the team');
select throws_like($$ select public.resolve_follow_up((select v::uuid from ctx where k = 'fu'), 'x') $$,
  '%rent or tenancy permission%', 'and outsiders cannot touch them');
reset role;

select * from finish();
rollback;
