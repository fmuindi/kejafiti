-- IMP-19: support requests are private to the person and platform admins, and support
-- gives admins no new access to anything else.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a8888888-0000-0000-0000-0000000000aa', 'asker8@example.test', '{"full_name":"Asker"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b8888888-0000-0000-0000-0000000000bb', 'other8@example.test', '{"full_name":"Other"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c8888888-0000-0000-0000-0000000000cc', 'admin8@example.test', '{"full_name":"Admin Eight"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c8888888-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

select set_config('request.jwt.claims', '{"sub":"a8888888-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('t', (public.create_support_ticket('{"category":"account","subject":"Cannot sign in","description":"The code email never arrives on my phone.","client_ref":"11111111-2222-3333-4444-555555555555"}'::jsonb) ->> 'id'));
select is((public.create_support_ticket('{"category":"account","subject":"Cannot sign in","description":"The code email never arrives on my phone.","client_ref":"11111111-2222-3333-4444-555555555555"}'::jsonb) ->> 'replayed')::boolean, true,
  'Sending the same request twice creates one ticket');
select is((select count(*)::int from public.support_tickets), 1, 'The requester sees their ticket');
select throws_like($$ select public.create_support_ticket('{"subject":"Hi","description":"short"}'::jsonb) $$, '%subject%', 'A subject is required');
reset role;

-- Another user: nothing visible, nothing writable.
select set_config('request.jwt.claims', '{"sub":"b8888888-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.support_tickets), 0, 'Another user cannot see the ticket');
select throws_like($$ select public.reply_support_ticket((select v::uuid from ctx where k = 't'), 'me too') $$, '%not found%', 'Another user cannot reply');
select throws_like($$ select public.admin_update_ticket((select v::uuid from ctx where k = 't'), '{"status":"resolved"}'::jsonb) $$, '%administrators only%',
  'Only platform admins can change a ticket');
select throws_like($$ insert into storage.objects (bucket_id, name, owner) values ('support-files', (select v from ctx where k = 't') || '/x.png', auth.uid()) $$,
  '%row-level security%', 'Another user cannot put a file in the ticket''s folder');
reset role;

-- The requester can attach into their own folder.
select set_config('request.jwt.claims', '{"sub":"a8888888-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('support-files', (select v from ctx where k = 't') || '/proof.png', auth.uid()) $$,
  'The requester can attach a file to their own ticket');
reset role;

-- Admin handles it.
select is((select count(*)::int from public.notifications where user_id = 'c8888888-0000-0000-0000-0000000000cc' and kind = 'support_ticket'), 1,
  'Admins are told about a new request');
select set_config('request.jwt.claims', '{"sub":"c8888888-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.admin_update_ticket((select v::uuid from ctx where k = 't'), '{"assign_to_me":true,"priority":"high"}'::jsonb);
select public.reply_support_ticket((select v::uuid from ctx where k = 't'), 'Check the spam folder, then tell us.');
select is((select status || ' ' || priority from public.support_tickets where id = (select v::uuid from ctx where k = 't')), 'in_progress high', 'A support reply moves it to in progress');
select public.admin_update_ticket((select v::uuid from ctx where k = 't'), '{"status":"resolved"}'::jsonb);
reset role;
select is((select count(*)::int from public.notifications where user_id = 'a8888888-0000-0000-0000-0000000000aa' and kind in ('support_reply', 'support_status')), 2,
  'The requester is told about the reply and the resolution');

-- The requester replies: it reopens.
select set_config('request.jwt.claims', '{"sub":"a8888888-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.reply_support_ticket((select v::uuid from ctx where k = 't'), 'Still nothing in spam.');
select is((select status from public.support_tickets), 'open', 'A reply from the requester reopens a resolved request');
select is((select count(*)::int from public.support_messages where side = 'system'), 1, 'Status changes are recorded in the thread');
reset role;
-- That admins cannot read rent records is covered with real entries in 02_permissions.

select * from finish();
rollback;
