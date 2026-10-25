-- Payment habits: each rent month is settled oldest charge first by confirmed payments (so
-- unallocated credit counts and a reversed payment never did), on time means covered by the due
-- date, and only people who can see the property see a tenant's habits and activity.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1900000-0000-0000-0000-0000000000aa', 'owner19@example.test', '{"full_name":"Owner Nineteen"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d1900000-0000-0000-0000-0000000000dd', 'viewer19@example.test', '{"full_name":"View Only"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('e1900000-0000-0000-0000-0000000000ee', 'outsider19@example.test', '{"full_name":"Out Sider"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"a1900000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Nineteen Homes', 'landlord'));
insert into public.properties (id, org_id, name, area, rent_due_day)
values ('a1900000-0000-0000-0000-000000000001', (select v::uuid from ctx where k = 'org'), 'Mkuyu Court', 'Ruiru', 5);
insert into public.units (id, org_id, property_id, label, layout, default_rent) values
  ('a1900000-0000-0000-0000-0000000000f1', (select v::uuid from ctx where k = 'org'), 'a1900000-0000-0000-0000-000000000001', 'K1', 'bedsitter_studio', 10000),
  ('a1900000-0000-0000-0000-0000000000f2', (select v::uuid from ctx where k = 'org'), 'a1900000-0000-0000-0000-000000000001', 'K2', 'bedsitter_studio', 10000);
insert into ctx values ('kim', public.create_tenancy(jsonb_build_object('unit_id', 'a1900000-0000-0000-0000-0000000000f1',
  'tenant_name', 'Kimani Njoroge', 'start_date', '2026-06-01', 'rent_amount', 10000, 'due_day', 5)));
insert into ctx values ('lea', public.create_tenancy(jsonb_build_object('unit_id', 'a1900000-0000-0000-0000-0000000000f2',
  'tenant_name', 'Leah Wafula', 'start_date', '2026-06-01', 'rent_amount', 10000, 'due_day', 5)));
select public.generate_rent_charges('a1900000-0000-0000-0000-000000000001', d::date)
from (values ('2026-06-01'), ('2026-07-01'), ('2026-08-01'), ('2026-09-01')) m(d);

-- Kimani: June on time; July 7 days late; August part by the due date, the rest 15 days late;
-- September unpaid. None of the payments is allocated: credit settles the oldest charge first.
create function pg_temp.pay(p_tenancy text, p_amount numeric, p_on date) returns uuid language sql as $$
  select (public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
    'tenancy_id', (select v from ctx where k = p_tenancy), 'amount', p_amount, 'paid_on', p_on::text,
    'allocations', '[]'::jsonb, 'action', 'confirm', 'acknowledged', true)) ->> 'id')::uuid
$$;
select pg_temp.pay('kim', 10000, '2026-06-03');
select pg_temp.pay('kim', 10000, '2026-07-12');
select pg_temp.pay('kim', 4000, '2026-08-01');
select pg_temp.pay('kim', 6000, '2026-08-20');
-- Leah: June paid then reversed (it never counted); July waived in full; then one payment on
-- 4 August covers June (late), August (on time) and September (ahead).
select public.reverse_entry(pg_temp.pay('lea', 10000, '2026-06-02'), 'Bounced cheque');
select public.adjust_charge((select id from public.rent_charges where tenancy_id = (select v::uuid from ctx where k = 'lea')
  and period_start = '2026-07-01'), 10000, 'Repairs agreed');
select pg_temp.pay('lea', 30000, '2026-08-04');
-- An awaiting entry never counts.
select public.save_payment_entry(jsonb_build_object('client_request_id', gen_random_uuid(),
  'tenancy_id', (select v from ctx where k = 'kim'), 'amount', 10000, 'paid_on', '2026-09-03',
  'allocations', '[]'::jsonb, 'action', 'submit'));
reset role;
insert into public.memberships (org_id, user_id, role, status, display_name, all_properties)
values ((select v::uuid from ctx where k = 'org'), 'd1900000-0000-0000-0000-0000000000dd', 'viewer', 'active', 'View Only', true);

-- Month by month --------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d1900000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
create temp table kim as select * from public.tenancy_payment_record((select v::uuid from ctx where k = 'kim'));
create temp table lea as select * from public.tenancy_payment_record((select v::uuid from ctx where k = 'lea'));
select is((select state from kim where period_start = '2026-06-01'), 'on_time', 'A month covered by the due date is on time');
select is((select state || ' ' || days_late from kim where period_start = '2026-07-01'), 'late 7', 'Covered after the due date is late, by how many days');
select is((select settled_on from kim where period_start = '2026-07-01'), '2026-07-12'::date, 'and it records when it was fully paid');
select is((select state || ' ' || days_late || ' ' || paid_by_due from kim where period_start = '2026-08-01'), 'late 15 4000.00',
  'A part payment by the due date shows, but the month is late until it is fully covered');
select is((select state from kim where period_start = '2026-09-01'), 'overdue', 'An unpaid past-due month is overdue, and a submitted payment doesn''t change that');
select is((select days_late from kim where period_start = '2026-09-01'), app.today() - '2026-09-05'::date, 'counting the days so far');
select is((select state from lea where period_start = '2026-06-01'), 'late', 'A reversed payment never counted: June was only covered later');
select is((select settled_on from lea where period_start = '2026-06-01'), '2026-08-04'::date, 'by the next real payment, oldest charge first');
select is((select state from lea where period_start = '2026-07-01'), 'waived', 'A month reduced to nothing is not counted as paid or late');
select is((select state from lea where period_start = '2026-09-01'), 'on_time', 'Paying ahead covers a later month on time');

-- The habits list ------------------------------------------------------------------------------
create temp table h as select * from public.tenant_payment_habits((select v::uuid from ctx where k = 'org'));
select is((select months_due || ' ' || on_time || ' ' || late || ' ' || overdue from h where unit_label = 'K1'), '4 1 2 1',
  'The habits list counts due months by result');
select is((select avg_days_late from h where unit_label = 'K1'), 11.0, 'and the average days late among late months');
select is((select recent from h where unit_label = 'K1'), array['on_time', 'late', 'late', 'overdue'], 'with the recent months oldest first');
select is((select on_time_streak from h where unit_label = 'K2'), 2, 'The on-time run counts back from the latest month, skipping waived ones');
select is((select months_due from h where unit_label = 'K2'), 3, 'A waived month is not a due month');
select is((select last_paid_on from h where unit_label = 'K1'), '2026-08-20'::date, 'Last paid is the latest confirmed payment');

-- Activity -------------------------------------------------------------------------------------
select is((select count(*)::int from public.tenancy_activity((select v::uuid from ctx where k = 'kim')) where kind = 'payment_confirmed'), 4,
  'Activity lists each confirmed payment');
select is((select count(*)::int from public.tenancy_activity((select v::uuid from ctx where k = 'lea')) where kind in ('payment_reversed', 'adjustment')), 2,
  'and reversals and adjustments');
reset role;

select set_config('request.jwt.claims', '{"sub":"e1900000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select * from public.tenancy_payment_record((select v::uuid from ctx where k = 'kim')) $$,
  '%don''t have access%', 'Someone outside the workspace can''t see a tenant''s months');
select is((select count(*)::int from public.tenant_payment_habits((select v::uuid from ctx where k = 'org'))), 0,
  'or anyone''s habits');
reset role;

select * from finish();
rollback;
