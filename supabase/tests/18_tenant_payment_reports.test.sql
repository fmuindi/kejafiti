-- Tenant-reported missing payments: only the tenant can report, it never changes the balance,
-- the people who check receipts are told, and staff answer by matching an entry or explaining
-- what they checked. The tenant sees the answer and the payment's progress, nothing more.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1800000-0000-0000-0000-0000000000aa', 'owner18@example.test', '{"full_name":"Owner Eighteen"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c1800000-0000-0000-0000-0000000000cc', 'caretaker18@example.test', '{"full_name":"Care Taker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d1800000-0000-0000-0000-0000000000dd', 'viewer18@example.test', '{"full_name":"View Only"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b1800000-0000-0000-0000-0000000000bb', 'wanjiru18@example.test', '{"full_name":"Wanjiru Kamau"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('e1800000-0000-0000-0000-0000000000ee', 'other18@example.test', '{"full_name":"Other Tenant"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Eighteen Homes', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('a1800000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Mninga Court', 'Kasarani', 5);
insert into public.units (id, org_id, property_id, label, layout, default_rent) values
  ('a1800000-0000-0000-0000-0000000000f1', (select v::uuid from ctx where k = 'org'), 'a1800000-0000-0000-0000-000000000001', 'N1', 'bedsitter_studio', 14000),
  ('a1800000-0000-0000-0000-0000000000f2', (select v::uuid from ctx where k = 'org'), 'a1800000-0000-0000-0000-000000000001', 'N2', 'bedsitter_studio', 14000);
insert into ctx values ('wanjiru', public.create_tenancy(jsonb_build_object('unit_id', 'a1800000-0000-0000-0000-0000000000f1',
  'tenant_name', 'Wanjiru Kamau', 'start_date', (app.today() - 40)::text, 'rent_amount', 14000)));
insert into ctx values ('other', public.create_tenancy(jsonb_build_object('unit_id', 'a1800000-0000-0000-0000-0000000000f2',
  'tenant_name', 'Other Tenant', 'start_date', (app.today() - 40)::text, 'rent_amount', 14000)));
select public.generate_rent_charges('a1800000-0000-0000-0000-000000000001', date_trunc('month', app.today())::date);
-- A confirmed payment on the other tenancy, to try matching against the wrong tenant.
insert into ctx values ('other_entry', public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'other'), 'amount', 14000, 'paid_on', app.today()::text,
  'allocations', '[]'::jsonb, 'action', 'confirm', 'acknowledged', true)) ->> 'id');
reset role;
-- Both tenants have online access.
update public.tenants set user_id = 'b1800000-0000-0000-0000-0000000000bb'
where id = (select tenant_id from public.tenancies where id = (select v::uuid from ctx where k = 'wanjiru'));
update public.tenants set user_id = 'e1800000-0000-0000-0000-0000000000ee'
where id = (select tenant_id from public.tenancies where id = (select v::uuid from ctx where k = 'other'));
insert into public.memberships (org_id, user_id, role, status, display_name, all_properties, can_enter_payments)
values ((select v::uuid from ctx where k = 'org'), 'c1800000-0000-0000-0000-0000000000cc', 'caretaker', 'active', 'Care Taker', true, true),
       ((select v::uuid from ctx where k = 'org'), 'd1800000-0000-0000-0000-0000000000dd', 'viewer', 'active', 'View Only', true, false);
insert into ctx values ('balance_before', (select app.tenancy_balance((select v::uuid from ctx where k = 'wanjiru')))::text);
insert into ctx values ('req', gen_random_uuid()::text);

-- The tenant reports ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b1800000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('r1', public.report_missing_payment(jsonb_build_object('client_request_id', (select v from ctx where k = 'req'),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 14000, 'paid_on', (app.today() - 2)::text,
  'method', 'mpesa', 'reference', ' qk12abc ', 'note', 'Paid from my husband''s line')));
select isnt((select v from ctx where k = 'r1'), null, 'A tenant can report a payment missing from their statement');
select is(public.report_missing_payment(jsonb_build_object('client_request_id', (select v from ctx where k = 'req'),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 14000, 'paid_on', (app.today() - 2)::text))::text,
  (select v from ctx where k = 'r1'), 'Sending the same report again returns the first one');
select is((select reference from public.payment_reports where id = (select v::uuid from ctx where k = 'r1')), 'QK12ABC',
  'The reference is kept tidy for matching');
select throws_like($$ select public.report_missing_payment(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 14000, 'paid_on', (app.today() - 1)::text, 'reference', 'QK12ABC')) $$,
  '%already reported a payment with this reference%', 'The same reference can''t be reported twice while it''s open');
select throws_like($$ select public.report_missing_payment(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 14000, 'paid_on', (app.today() + 1)::text)) $$,
  '%can''t be in the future%', 'A payment date in the future is refused');
select throws_like($$ select public.report_missing_payment(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 0, 'paid_on', app.today()::text)) $$,
  '%amount you paid%', 'The amount must be more than zero');
insert into ctx values ('r2', public.report_missing_payment(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 2000, 'paid_on', app.today()::text, 'method', 'cash')));
insert into ctx values ('r3', public.report_missing_payment(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 500, 'paid_on', app.today()::text)));
select is((select count(*)::int from public.my_payment_reports((select v::uuid from ctx where k = 'wanjiru'))), 3,
  'The tenant sees their own reports');
reset role;

select is(app.tenancy_balance((select v::uuid from ctx where k = 'wanjiru'))::text, (select v from ctx where k = 'balance_before'),
  'A report never changes the balance');
select is((select count(*)::int from public.notifications where kind = 'payment_reported' and event_key = 'payment_report:' || (select v from ctx where k = 'r1')),
  1, 'The person who checks receipts is told');
select ok((select link from public.notifications where kind = 'payment_reported' and event_key = 'payment_report:' || (select v from ctx where k = 'r1') limit 1) like '/w/%/units/a1800000-0000-0000-0000-0000000000f1#reported',
  'The alert opens the unit''s reports');
select is((select count(*)::int from public.notifications where kind = 'payment_reported' and user_id = 'c1800000-0000-0000-0000-0000000000cc'),
  0, 'Staff who don''t confirm payments aren''t alerted');

-- Who can see and report -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"e1800000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.report_missing_payment(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 100, 'paid_on', app.today()::text)) $$,
  '%your own tenancy%', 'Nobody can report on someone else''s tenancy');
select is((select count(*)::int from public.payment_reports), 0, 'Another tenant sees none of these reports');
select is((select count(*)::int from public.my_payment_reports((select v::uuid from ctx where k = 'wanjiru'))), 0,
  'and can''t read them through the tenant view');
select throws_like($$ select public.withdraw_payment_report((select v::uuid from ctx where k = 'r2')) $$,
  '%wasn''t found%', 'or withdraw them');
reset role;

select set_config('request.jwt.claims', '{"sub":"d1800000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.payment_reports), 3, 'Staff who can see the property see the reports');
select throws_like($$ select public.answer_payment_report(jsonb_build_object('report_id', (select v from ctx where k = 'r1'),
  'outcome', 'not_found', 'reply', 'x')) $$, '%rent or tenancy permission%', 'View-only staff can''t answer them');
reset role;

-- Staff answer ----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c1800000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.answer_payment_report(jsonb_build_object('report_id', (select v from ctx where k = 'r1'),
  'outcome', 'matched', 'entry_id', (select v from ctx where k = 'other_entry'))) $$,
  '%entry for this tenant%', 'A report can only be matched to the same tenant''s payment');
select throws_like($$ select public.answer_payment_report(jsonb_build_object('report_id', (select v from ctx where k = 'r2'),
  'outcome', 'not_found')) $$, '%what you checked%', 'Saying it wasn''t found needs a reason for the tenant');
-- The caretaker records the payment and matches the report to it.
insert into ctx values ('entry', public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'wanjiru'), 'amount', 14000, 'paid_on', (app.today() - 2)::text, 'reference', 'QK12ABC',
  'allocations', '[]'::jsonb, 'action', 'submit')) ->> 'id');
select lives_ok($$ select public.answer_payment_report(jsonb_build_object('report_id', (select v from ctx where k = 'r1'),
  'outcome', 'matched', 'entry_id', (select v from ctx where k = 'entry'), 'reply', 'Found it, thanks')) $$,
  'Staff who enter payments can match a report to the entry');
select lives_ok($$ select public.answer_payment_report(jsonb_build_object('report_id', (select v from ctx where k = 'r1'),
  'outcome', 'matched', 'entry_id', (select v from ctx where k = 'entry'))) $$, 'Repeating the same answer is harmless');
select throws_like($$ select public.answer_payment_report(jsonb_build_object('report_id', (select v from ctx where k = 'r1'),
  'outcome', 'not_found', 'reply', 'No')) $$, '%already answered%', 'A different answer after the first is refused');
select lives_ok($$ select public.answer_payment_report(jsonb_build_object('report_id', (select v from ctx where k = 'r2'),
  'outcome', 'not_found', 'reply', 'No cash receipt for that day. Send a photo of the receipt.')) $$,
  'Staff can say they couldn''t find it, with what to send');
reset role;

select is((select count(*)::int from public.notifications where user_id = 'b1800000-0000-0000-0000-0000000000bb'
  and kind = 'tenancy_payment_report' and org_id is null and link like '/my-rent/%#reports'), 2, 'The tenant is told about each answer');

-- What the tenant sees afterwards ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.decide_entry((select v::uuid from ctx where k = 'entry'), 'confirm', null, true);
reset role;
select set_config('request.jwt.claims', '{"sub":"b1800000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select payment_state from public.my_payment_reports((select v::uuid from ctx where k = 'wanjiru')) where id = (select v::uuid from ctx where k = 'r1')),
  'confirmed', 'Once the matched payment is confirmed, the tenant sees it confirmed');
select is((select reply from public.my_payment_reports((select v::uuid from ctx where k = 'wanjiru')) where id = (select v::uuid from ctx where k = 'r2')),
  'No cash receipt for that day. Send a photo of the receipt.', 'The tenant sees what staff checked');
select throws_like($$ select public.withdraw_payment_report((select v::uuid from ctx where k = 'r2')) $$,
  '%already been answered%', 'An answered report can''t be withdrawn');
select lives_ok($$ select public.withdraw_payment_report((select v::uuid from ctx where k = 'r3')) $$,
  'The tenant can withdraw an open report');
reset role;

select * from finish();
rollback;
