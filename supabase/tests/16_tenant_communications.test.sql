-- Tenant communications: invoices, reminders and messages emailed to tenants by staff with
-- tenancy permission; skipped with a reason when they can't go; kept as a record the tenant
-- sees once they have online access. Also bulk online-access invitations and contact edits.

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1600000-0000-0000-0000-0000000000aa', 'owner16@example.test', '{"full_name":"Owner Sixteen"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b1600000-0000-0000-0000-0000000000bb', 'amina16@example.test', '{"full_name":"Amina S"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b1600000-0000-0000-0000-0000000000b2', 'other16@example.test', '{"full_name":"Someone Else"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d1600000-0000-0000-0000-0000000000dd', 'caretaker16@example.test', '{"full_name":"Caretaker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- Owner: three tenancies. Amina owes 7,000 of September's 12,000; Peter has no email; Zawadi
-- has an email and no charges.
select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Sixteen Homes', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('a1600000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Jamii Court', 'Kilimani', 5);
insert into public.units (id, org_id, property_id, label, layout, default_rent) values
  ('a1600000-0000-0000-0000-0000000000f1', (select v::uuid from ctx where k = 'org'), 'a1600000-0000-0000-0000-000000000001', 'J1', 'bedsitter_studio', 12000),
  ('a1600000-0000-0000-0000-0000000000f2', (select v::uuid from ctx where k = 'org'), 'a1600000-0000-0000-0000-000000000001', 'J2', 'bedsitter_studio', 12000),
  ('a1600000-0000-0000-0000-0000000000f3', (select v::uuid from ctx where k = 'org'), 'a1600000-0000-0000-0000-000000000001', 'J3', 'bedsitter_studio', 12000);
insert into ctx values ('amina', public.create_tenancy(jsonb_build_object('unit_id', 'a1600000-0000-0000-0000-0000000000f1',
  'tenant_name', 'Amina S', 'tenant_email', 'amina16@example.test', 'start_date', '2026-09-01', 'rent_amount', 12000)));
insert into ctx values ('peter', public.create_tenancy(jsonb_build_object('unit_id', 'a1600000-0000-0000-0000-0000000000f2',
  'tenant_name', 'Peter N', 'start_date', '2026-09-01', 'rent_amount', 12000)));
select public.generate_rent_charges('a1600000-0000-0000-0000-000000000001', '2026-09-01');
insert into ctx values ('zawadi', public.create_tenancy(jsonb_build_object('unit_id', 'a1600000-0000-0000-0000-0000000000f3',
  'tenant_name', 'Zawadi K', 'tenant_email', 'zawadi16@example.test', 'start_date', '2026-10-01', 'rent_amount', 12000)));
select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'amina'), 'amount', 5000, 'paid_on', '2026-09-03',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id',
    (select id from public.rent_charges where tenancy_id = (select v::uuid from ctx where k = 'amina')), 'amount', 5000)),
  'action', 'confirm', 'acknowledged', true));
reset role;
insert into ctx select 'amina_tenant', tenant_id::text from public.tenancies where id = (select v::uuid from ctx where k = 'amina');
insert into ctx select 'peter_tenant', tenant_id::text from public.tenancies where id = (select v::uuid from ctx where k = 'peter');
insert into ctx select 'zawadi_tenant', tenant_id::text from public.tenancies where id = (select v::uuid from ctx where k = 'zawadi');
insert into public.memberships (org_id, user_id, role, status, display_name, all_properties, can_enter_payments)
values ((select v::uuid from ctx where k = 'org'), 'd1600000-0000-0000-0000-0000000000dd', 'caretaker', 'active', 'Caretaker', true, true);

-- Permission and validation -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d1600000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'message',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina')), 'subject', 'Water', 'body', 'Water is off on Friday.')) $$,
  '%tenancy permission%', 'Staff without tenancy permission cannot message tenants');
select throws_like($$ select public.update_tenant_contact((select v::uuid from ctx where k = 'peter_tenant'), 'peter16@example.test', null) $$,
  '%tenancy permission%', 'or change their contact details');
select is((select count(*)::int from public.property_tenants('a1600000-0000-0000-0000-000000000001')), 3,
  'Staff who can see the property see its tenants');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'message',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina')), 'subject', 'Water')) $$,
  '%subject and a message%', 'A message needs a subject and a body');
select throws_like($$ select public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'invoice',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina')))) $$,
  '%month to invoice%', 'An invoice needs a month');
select throws_like($$ select public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'message',
  'tenancy_ids', '[]'::jsonb, 'subject', 'Water', 'body', 'Off')) $$,
  '%at least one tenant%', 'A send needs at least one tenant');
select throws_like($$ select public.send_tenant_messages(jsonb_build_object('client_request_id', 'nope', 'kind', 'message',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina')), 'subject', 'Water', 'body', 'Off')) $$,
  '%isn''t valid%', 'A malformed request is refused in plain words');

-- Invoices ----------------------------------------------------------------------------------
insert into ctx values ('invoice_req', gen_random_uuid()::text);
insert into ctx values ('invoice', public.send_tenant_messages(jsonb_build_object('client_request_id', (select v from ctx where k = 'invoice_req'),
  'kind', 'invoice', 'period', '2026-09-01', 'body', 'Pay by M-PESA to the usual paybill.',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina'), (select v from ctx where k = 'peter'), (select v from ctx where k = 'zawadi'))))::text);
select is(jsonb_array_length((select v::jsonb -> 'sent' from ctx where k = 'invoice')), 1, 'One of three tenants is invoiced');
select is((select string_agg(s ->> 'reason', ',' order by s ->> 'reason') from jsonb_array_elements((select v::jsonb -> 'skipped' from ctx where k = 'invoice')) s),
  'no_charges,no_email', 'The others are skipped with a reason: no email, no charges that month');
reset role;
insert into ctx select 'invoice_id', v::jsonb -> 'sent' -> 0 ->> 'id' from ctx where k = 'invoice';
select matches((select ref from public.tenant_messages where id = (select v::uuid from ctx where k = 'invoice_id')), '^INV-\d{6}$',
  'An invoice gets its own number');
select is((select details ->> 'period_total' || ' ' || (details ->> 'earlier_balance') || ' ' || (details ->> 'amount_due')
  from public.tenant_messages where id = (select v::uuid from ctx where k = 'invoice_id')),
  '12000.00 -5000.00 7000.00', 'The invoice shows the month''s charges, payments since, and the amount due');
select is((select subject from public.tenant_messages where id = (select v::uuid from ctx where k = 'invoice_id')),
  'Invoice for September 2026: Jamii Court, unit J1', 'The subject names the month and the home');
select is((select template || ' ' || destination || ' ' || (payload ->> 'ref') from public.delivery_tasks
  where event_key = 'tenant_message:' || (select v from ctx where k = 'invoice_id')),
  'tenant_invoice amina16@example.test ' || (select ref from public.tenant_messages where id = (select v::uuid from ctx where k = 'invoice_id')),
  'The invoice is queued as an email to the tenant');
select is((select payload ->> 'link' from public.delivery_tasks where event_key = 'tenant_message:' || (select v from ctx where k = 'invoice_id')),
  null, 'Without online access the email has no link to open');

select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select is(public.send_tenant_messages(jsonb_build_object('client_request_id', (select v from ctx where k = 'invoice_req'),
  'kind', 'invoice', 'period', '2026-09-01', 'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina')))) -> 'sent' -> 0 ->> 'id',
  (select v from ctx where k = 'invoice_id'), 'Retrying the same send returns the invoice already sent');
reset role;
select is((select count(*)::int from public.tenant_messages where kind = 'invoice' and tenancy_id = (select v::uuid from ctx where k = 'amina')), 1, 'and sends nothing twice');

-- Reminders -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('reminder', public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'reminder',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina'), (select v from ctx where k = 'zawadi'))))::text);
select is((select v::jsonb -> 'skipped' -> 0 ->> 'reason' from ctx where k = 'reminder'), 'nothing_owed', 'No reminder for a tenant who owes nothing');
select is((select v::jsonb -> 'skipped' -> 0 ->> 'reason' from public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(),
  'kind', 'reminder', 'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina')))) as r(v)), 'reminded_recently',
  'A tenant is reminded at most once a day');
reset role;
select is((select subject || ' | ' || (details -> 'lines' -> 0 ->> 'outstanding') from public.tenant_messages
  where id = (select (v::jsonb -> 'sent' -> 0 ->> 'id')::uuid from ctx where k = 'reminder')),
  'Rent reminder: KSh 7,000 due for Jamii Court, unit J1 | 7000.00', 'The reminder says what is owed and for which charge');

-- Contact details, then a message to everyone -------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.update_tenant_contact((select v::uuid from ctx where k = 'peter_tenant'), 'not-an-email', null) $$,
  '%email address%', 'A tenant''s email must be a real address');
select throws_like($$ select public.update_tenant_contact((select v::uuid from ctx where k = 'peter_tenant'), 'caretaker16@example.test', null) $$,
  '%someone on your team%', 'and not a team member''s');
select lives_ok($$ select public.update_tenant_contact((select v::uuid from ctx where k = 'peter_tenant'), ' Peter16@Example.test ', '0711 000 000') $$,
  'Staff with tenancy permission can change a tenant''s email and phone');
select is((select email from public.property_tenants('a1600000-0000-0000-0000-000000000001') where unit_label = 'J2'),
  'peter16@example.test', 'The new email is used from now on');
insert into ctx values ('notice', public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'message',
  'subject', 'Water off on Friday', 'body', 'The county is repairing the main line, 9am to 3pm.',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina'), (select v from ctx where k = 'peter'), (select v from ctx where k = 'zawadi'))))::text);
select is(jsonb_array_length((select v::jsonb -> 'sent' from ctx where k = 'notice')), 3, 'A message can go to every tenant at once');
reset role;

-- Online access, in bulk ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select is((public.invite_tenants_access(array[(select v::uuid from ctx where k = 'amina_tenant'), (select v::uuid from ctx where k = 'peter_tenant')]) ->> 'sent')::int,
  2, 'Several tenants can be invited to online access at once');
select is((select s ->> 'reason' from jsonb_array_elements(public.invite_tenants_access(array[(select v::uuid from ctx where k = 'amina_tenant')]) -> 'skipped') s),
  'invited', 'A tenant whose link is still waiting is not sent another');
reset role;
select is((select count(*)::int from public.delivery_tasks where template = 'tenant_access_invitation' and destination in ('amina16@example.test', 'peter16@example.test')),
  2, 'Each invited tenant is emailed a link');

-- What the tenant sees ------------------------------------------------------------------------
-- Amina accepts online access (the link token isn't returned in bulk; set one for the test).
update public.tenants set access_token_hash = app.hash_token('amina-token'), access_expires_at = now() + interval '1 day'
where id = (select v::uuid from ctx where k = 'amina_tenant');
select set_config('request.jwt.claims', '{"sub":"b1600000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.accept_tenant_access('amina-token');
select is((select count(*)::int from public.tenant_messages), 3, 'The tenant sees the invoice, reminder and message sent to them');
select is((select count(*)::int from public.tenant_messages where tenancy_id <> (select v::uuid from ctx where k = 'amina')), 0,
  'and nothing sent to other tenants');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('after_access', public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'message',
  'subject', 'Gate code', 'body', 'The new gate code is with the caretaker.', 'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina'))))::text);
reset role;
select is((select link from public.notifications where user_id = 'b1600000-0000-0000-0000-0000000000bb' and kind = 'tenancy_message' and org_id is null),
  '/my-rent/' || (select v from ctx where k = 'amina') || '/messages/' || (select v::jsonb -> 'sent' -> 0 ->> 'id' from ctx where k = 'after_access'),
  'A tenant with online access gets an in-app update that opens the message');
select is((select payload ->> 'link' from public.delivery_tasks
  where event_key = 'tenant_message:' || (select v::jsonb -> 'sent' -> 0 ->> 'id' from ctx where k = 'after_access')),
  '/my-rent/' || (select v from ctx where k = 'amina') || '/messages/' || (select v::jsonb -> 'sent' -> 0 ->> 'id' from ctx where k = 'after_access'),
  'and the email links to it');
select is((select count(*)::int from public.delivery_tasks where template = 'notification' and destination = 'amina16@example.test'), 0,
  'The in-app update doesn''t send a second email');

select set_config('request.jwt.claims', '{"sub":"b1600000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.tenant_messages), 0, 'Someone else sees no tenant messages');
select is((select count(*)::int from public.property_tenants('a1600000-0000-0000-0000-000000000001')), 0, 'and no tenants');
select throws_like($$ select public.send_tenant_messages(jsonb_build_object('client_request_id', gen_random_uuid(), 'kind', 'message',
  'tenancy_ids', jsonb_build_array((select v from ctx where k = 'amina')), 'subject', 'Hi', 'body', 'Hi')) $$,
  '%tenancy permission%', 'and cannot message them');
reset role;

-- Delivery status -------------------------------------------------------------------------------
update public.delivery_tasks set status = 'failed', last_error = 'Mailbox full'
where event_key = 'tenant_message:' || (select v from ctx where k = 'invoice_id');
select is((select delivery_status || ' ' || delivery_error from public.tenant_messages where id = (select v::uuid from ctx where k = 'invoice_id')),
  'failed Mailbox full', 'The record shows whether its email went');

select * from finish();
rollback;
