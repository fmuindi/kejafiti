-- IMP-04: queue health is explicit, old backlogs are held for a decision, and a task is
-- never handed over twice.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('c5555555-0000-0000-0000-0000000000cc', 'admin5@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('d5555555-0000-0000-0000-0000000000dd', 'user5@example.test', '{"full_name":"User"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c5555555-0000-0000-0000-0000000000cc');

-- Start from an empty queue inside this transaction (registrations above queued alerts).
delete from public.delivery_tasks;
select app.queue_delivery(null, 'test:fresh', 'email', 'fresh@example.test', 'admin_registration', '{}');
select app.queue_delivery(null, 'test:fresh', 'email', 'fresh@example.test', 'admin_registration', '{}');
select is((select count(*)::int from public.delivery_tasks where event_key = 'test:fresh'), 1, 'The same event queues one task, however often it fires');
select app.queue_delivery(null, 'test:old', 'email', 'old@example.test', 'admin_registration', '{}');
update public.delivery_tasks set created_at = now() - interval '3 days', next_attempt_at = now() - interval '3 days' where event_key = 'test:old';
select app.queue_delivery(null, 'test:late', 'email', 'late@example.test', 'admin_registration', '{}');
update public.delivery_tasks set created_at = now() - interval '1 hour', next_attempt_at = now() - interval '40 minutes' where event_key = 'test:late';

-- Only admins can read health.
select set_config('request.jwt.claims', '{"sub":"d5555555-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.admin_delivery_health() $$, 'P0001', null, 'Non-admins cannot read delivery health');
reset role;

select set_config('request.jwt.claims', '{"sub":"c5555555-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select is((public.admin_delivery_health() ->> 'held')::int, 1, 'A task older than 48 hours is held, not due');
select is((public.admin_delivery_health() ->> 'overdue')::int, 1, 'A task due for longer than 15 minutes is overdue');
select is((public.admin_queue_counts() ->> 'delivery_attention')::int, 2,
  'The overview counts overdue and held tasks as needing attention even with no failures');
select is((select state from public.admin_delivery_tasks() where destination_masked like 'o%'), 'held', 'The row for the old task says held');
select ok((select bool_and(destination_masked not like '%old@%' and destination_masked not like '%fresh@%') from public.admin_delivery_tasks()),
  'Destinations are masked before they leave the database');
reset role;

-- The worker never picks up the held task by itself.
set local role service_role;
create temp table claimed on commit drop as select * from public.claim_delivery_tasks(10);
reset role;
select is((select count(*)::int from claimed), 2, 'The worker claims the due tasks');
select ok(not exists (select 1 from claimed where event_key = 'test:old'), 'The worker skips the held old task');

-- A finished task can't be finished again by a stale worker.
set local role service_role;
select public.finish_delivery_task((select id from claimed where event_key = 'test:fresh'), true, 'msg-1', '', true);
select public.finish_delivery_task((select id from claimed where event_key = 'test:fresh'), false, '', 'late timeout', true);
reset role;
select is((select status || ' ' || provider_ref from public.delivery_tasks where event_key = 'test:fresh'), 'accepted msg-1',
  'A late result from a stale worker does not overwrite the accepted task');

-- An admin decides about the held task: send it.
select set_config('request.jwt.claims', '{"sub":"c5555555-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.admin_retry_delivery((select id from public.delivery_tasks where event_key = 'test:old'));
select is((select released_by from public.delivery_tasks where event_key = 'test:old'), 'c5555555-0000-0000-0000-0000000000cc'::uuid,
  'Sending a held task records which admin decided');
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_delivery_tasks(10) where event_key = 'test:old'), 1, 'A released task is picked up by the next run');
reset role;

-- Cancelling stops a task for good.
select app.queue_delivery(null, 'test:cancel', 'email', 'cancel@example.test', 'admin_registration', '{}');
select set_config('request.jwt.claims', '{"sub":"c5555555-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.admin_cancel_delivery((select id from public.delivery_tasks where event_key = 'test:cancel'));
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_delivery_tasks(10) where event_key = 'test:cancel'), 0, 'A cancelled task is never sent');
reset role;
select is((select status from public.delivery_tasks where event_key = 'test:cancel'), 'cancelled', 'Its status says cancelled');

select * from finish();
rollback;
