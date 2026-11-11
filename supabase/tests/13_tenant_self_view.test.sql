-- Tenant self-view: invite by email, accept with that account only, see own balance and
-- statement (confirmed records only), never staff notes or anyone else's tenancy.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1300000-0000-0000-0000-0000000000aa', 'owner13@example.test', '{"full_name":"Owner Thirteen"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b1300000-0000-0000-0000-0000000000bb', 'amina13@example.test', '{"full_name":"Amina T"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b1300000-0000-0000-0000-0000000000b2', 'other13@example.test', '{"full_name":"Someone Else"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d1300000-0000-0000-0000-0000000000dd', 'caretaker13@example.test', '{"full_name":"Caretaker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- Owner: property, two tenancies, a charge and a confirmed part payment ------------------------
select set_config('request.jwt.claims', '{"sub":"a1300000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Thirteen Homes', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('a1300000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Baraka Court', 'Kilimani', 5);
insert into public.units (id, org_id, property_id, label, layout, default_rent) values
  ('a1300000-0000-0000-0000-0000000000f1', (select v::uuid from ctx where k = 'org'), 'a1300000-0000-0000-0000-000000000001', 'B1', 'bedsitter_studio', 12000),
  ('a1300000-0000-0000-0000-0000000000f2', (select v::uuid from ctx where k = 'org'), 'a1300000-0000-0000-0000-000000000001', 'B2', 'bedsitter_studio', 12000);
insert into ctx values ('tenancy', public.create_tenancy(jsonb_build_object('unit_id', 'a1300000-0000-0000-0000-0000000000f1',
  'tenant_name', 'Amina T', 'start_date', '2026-09-01', 'rent_amount', 12000)));
insert into ctx values ('other_tenancy', public.create_tenancy(jsonb_build_object('unit_id', 'a1300000-0000-0000-0000-0000000000f2',
  'tenant_name', 'Peter N', 'start_date', '2026-09-01', 'rent_amount', 12000)));
select public.generate_rent_charges('a1300000-0000-0000-0000-000000000001', '2026-09-01');
select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'tenancy'), 'amount', 5000, 'paid_on', '2026-09-03',
  'allocations', jsonb_build_array(jsonb_build_object('charge_id',
    (select id from public.rent_charges where tenancy_id = (select v::uuid from ctx where k = 'tenancy')), 'amount', 5000)),
  'action', 'confirm', 'acknowledged', true));
reset role;
insert into ctx values ('tenant', (select tenant_id::text from public.tenancies where id = (select v::uuid from ctx where k = 'tenancy')));
update public.tenants set notes = 'Staff only: asked for a payment plan' where id = (select v::uuid from ctx where k = 'tenant');
-- A caretaker without tenancy permission
insert into public.memberships (org_id, user_id, role, status, display_name, all_properties, can_enter_payments)
values ((select v::uuid from ctx where k = 'org'), 'd1300000-0000-0000-0000-0000000000dd', 'caretaker', 'active', 'Caretaker', true, true);

-- Inviting -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d1300000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.invite_tenant_access((select v::uuid from ctx where k = 'tenant'), 'amina13@example.test') $$,
  '%tenancy permission%', 'Staff without tenancy permission cannot invite a tenant');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1300000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.invite_tenant_access((select v::uuid from ctx where k = 'tenant'), 'not-an-email') $$,
  '%email address%', 'The invitation needs a real email address');
select throws_like($$ select public.invite_tenant_access((select v::uuid from ctx where k = 'tenant'), 'owner13@example.test') $$,
  '%someone on your team%', 'A team member''s email cannot be used for a tenant');
insert into ctx values ('first_token', public.invite_tenant_access((select v::uuid from ctx where k = 'tenant'), ' Amina13@Example.test ') ->> 'token');
insert into ctx values ('token', public.invite_tenant_access((select v::uuid from ctx where k = 'tenant'), 'amina13@example.test') ->> 'token');
reset role;
select is((select count(*)::int from public.delivery_tasks where template = 'tenant_access_invitation' and destination = 'amina13@example.test'), 2,
  'Each invitation emails the tenant a link');
select is((select payload ->> 'unit_label' from public.delivery_tasks where template = 'tenant_access_invitation' and destination = 'amina13@example.test' limit 1), 'B1',
  'The email says which unit it is about');
select is((select access_token_hash from public.tenants where id = (select v::uuid from ctx where k = 'tenant')),
  app.hash_token((select v from ctx where k = 'token')), 'Only a hash of the newest link is stored');

-- Preview and accept ---------------------------------------------------------------------------
set local role anon;
select is(public.tenant_access_preview((select v from ctx where k = 'first_token')) ->> 'state', 'invalid', 'Sending a new link replaces the old one');
select is((select p ->> 'state' || ' ' || (p ->> 'property_name') || ' ' || (p ->> 'email_hint')
  from (select public.tenant_access_preview((select v from ctx where k = 'token')) p) x),
  'pending Baraka Court a•••@example.test', 'The link previews the property and a hint of the email, without signing in');
reset role;
select set_config('request.jwt.claims', '{"sub":"b1300000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.accept_tenant_access((select v from ctx where k = 'token')) $$,
  '%different email%', 'Someone else cannot accept the link');
select is((select count(*)::int from public.my_tenancies()), 0, 'and sees no tenancy');
reset role;
select set_config('request.jwt.claims', '{"sub":"b1300000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.accept_tenant_access((select v from ctx where k = 'token')) $$, 'The tenant accepts with their own account');
select throws_like($$ select public.accept_tenant_access((select v from ctx where k = 'token')) $$, '%not valid%', 'The link works once');

-- What the tenant sees ------------------------------------------------------------------------
select is((select property_name || ' ' || unit_label || ' ' || current_rent || ' ' || balance from public.my_tenancies()),
  'Baraka Court B1 12000.00 7000.00', 'They see their home, rent and balance (12,000 charged, 5,000 confirmed)');
select is((select count(*)::int from public.tenancy_statement((select v::uuid from ctx where k = 'tenancy'))), 2,
  'and their statement: the September rent and the confirmed payment');
select is((select count(*)::int from public.tenancy_statement((select v::uuid from ctx where k = 'other_tenancy'))), 0,
  'but nothing of the neighbour''s tenancy');
select is((select count(*)::int from public.tenants), 0, 'Staff notes on the tenant record stay with the team');
select throws_ok($$ select public.invite_tenant_access((select v::uuid from ctx where k = 'tenant'), 'x@example.test') $$,
  'P0001', null, 'A tenant cannot manage access');
reset role;
select is((select count(*)::int from public.notifications where user_id = 'a1300000-0000-0000-0000-0000000000aa' and kind = 'tenancy_access_accepted'), 1,
  'The person who invited them hears it was accepted');

-- Removing access ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1300000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.revoke_tenant_access((select v::uuid from ctx where k = 'tenant'));
reset role;
select set_config('request.jwt.claims', '{"sub":"b1300000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.my_tenancies()) + (select count(*)::int from public.rent_charges), 0,
  'Once staff remove access, the tenant sees nothing');
reset role;

select * from finish();
rollback;
