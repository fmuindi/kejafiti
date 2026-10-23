-- Live status in conversations: only the two sides of a conversation can see each other's
-- last-active time or join its private presence and typing channel.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a2222222-0000-0000-0000-0000000000aa', 'owner9@example.test', '{"full_name":"Wanjiru K"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b2222222-0000-0000-0000-0000000000bb', 'tenant9a@example.test', '{"full_name":"Tenant A"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b3333333-0000-0000-0000-0000000000bb', 'tenant9b@example.test', '{"full_name":"Tenant B"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c2222222-0000-0000-0000-0000000000cc', 'admin9@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c2222222-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- A published listing ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Wanjiru Homes', 'landlord'));
insert into ctx values ('listing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Presenceville', 'road', 'Test Rd', 'unit_label', 'C7', 'layout', 'bedsitter_studio')));
update public.listings set rent_amount = 12000, deposit_months = 1, title = 'Bedsitter near the stage',
  available_from = '2026-11-01', contact_phone = '0712345678', viewing_instructions = 'Ask for the caretaker at gate 2'
where id = (select v::uuid from ctx where k = 'listing');
insert into public.listing_charges (listing_id, kind, amount, frequency, billing) values
  ((select v::uuid from ctx where k = 'listing'), 'water', null, 'monthly', 'metered');
insert into public.listing_photos (listing_id, org_id, storage_path, position)
select (select v::uuid from ctx where k = 'listing'), (select v::uuid from ctx where k = 'org'),
       (select v from ctx where k = 'org') || '/' || (select v from ctx where k = 'listing') || '/p' || g || '.jpg', g
from generate_series(1, 4) g;
select public.submit_listing((select v::uuid from ctx where k = 'listing'));
reset role;
select set_config('request.jwt.claims', '{"sub":"c2222222-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.admin_review_listing((select v::uuid from ctx where k = 'listing'), 'publish', null);
reset role;
insert into ctx values ('ref', (select ref from public.listings where id = (select v::uuid from ctx where k = 'listing')));

-- Tenant A enquires --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('conv', public.start_conversation((select v from ctx where k = 'ref'), 'Is water included?', gen_random_uuid()));
reset role;
insert into ctx values ('topic', 'conv:' || (select v from ctx where k = 'conv'));

-- Both sides check in -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.touch_activity() $$, 'The tenant records activity');
select throws_ok($$ select * from public.user_activity $$, '42501', null, 'Nobody reads activity times directly');
select is((select count(*)::int from public.conversation_activity(array[(select v::uuid from ctx where k = 'conv')])), 1,
  'The tenant gets a status row for their conversation');
select ok(app.conversation_topic_ok((select v from ctx where k = 'topic')), 'The tenant may join the conversation channel');
reset role;

select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.touch_activity();
select ok((select last_active_at is not null from public.conversation_activity(array[(select v::uuid from ctx where k = 'conv')])),
  'The owner sees when the tenant was last active');
reset role;

select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select ok((select last_active_at is not null from public.conversation_activity(array[(select v::uuid from ctx where k = 'conv')])),
  'The tenant sees when the advertiser team was last active');
reset role;

-- Someone outside the conversation ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b3333333-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.conversation_activity(array[(select v::uuid from ctx where k = 'conv')])), 0,
  'Another tenant gets no status for a conversation they are not in');
select ok(not app.conversation_topic_ok((select v from ctx where k = 'topic')), 'Another tenant may not join the conversation channel');
select ok(not app.conversation_topic_ok('conv:not-a-uuid'), 'A malformed channel name is refused without an error');
reset role;

select * from finish();
rollback;
