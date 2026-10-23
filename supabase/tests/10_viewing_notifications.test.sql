-- Viewing notifications: every action notifies the other side (and the advertiser's colleagues),
-- each notification opens the conversation's viewing card, and repeats are not swallowed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a2222222-0000-0000-0000-0000000000aa', 'owner10@example.test', '{"full_name":"Wanjiru K"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b2222222-0000-0000-0000-0000000000bb', 'tenant10a@example.test', '{"full_name":"Tenant A"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b3333333-0000-0000-0000-0000000000bb', 'tenant10b@example.test', '{"full_name":"Tenant B"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c2222222-0000-0000-0000-0000000000cc', 'admin10@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c2222222-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- A published listing ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Wanjiru Lets', 'landlord'));
insert into ctx values ('listing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Viewville', 'road', 'Test Rd', 'unit_label', 'C7', 'layout', 'bedsitter_studio')));
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
-- A colleague who handles listings, and the conversation's links ----------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('d2222222-0000-0000-0000-0000000000dd', 'manager10@example.test', '{"full_name":"Mary Manager"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.memberships (org_id, user_id, role, status, display_name, all_properties, can_manage_listings)
values ((select v::uuid from ctx where k = 'org'), 'd2222222-0000-0000-0000-0000000000dd', 'manager', 'active', 'Mary Manager', true, true);
insert into ctx values ('team_link', '/w/' || (select v from ctx where k = 'org') || '/enquiries/' || (select v from ctx where k = 'conv') || '#viewing');
insert into ctx values ('tenant_link', '/messages/' || (select v from ctx where k = 'conv') || '#viewing');
create function pg_temp.n(p_user uuid, p_kind text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and kind = p_kind $$;

-- The tenant asks for a viewing ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('viewing', public.request_viewing((select v from ctx where k = 'ref'), now() + interval '2 days', 'After work', gen_random_uuid()));
reset role;
select is((select link from public.notifications where user_id = 'a2222222-0000-0000-0000-0000000000aa' and kind = 'viewing_requested'),
  (select v from ctx where k = 'team_link'), 'The owner is notified, and the notification opens the viewing in the conversation');
select is(pg_temp.n('d2222222-0000-0000-0000-0000000000dd', 'viewing_requested'), 1, 'The manager who handles listings is notified too');
select ok((select title like 'Viewing request · Unit C7' and body like 'Tenant A wants to view it on %' from public.notifications
  where user_id = 'a2222222-0000-0000-0000-0000000000aa' and kind = 'viewing_requested'), 'The request says who, which unit and when');

-- The owner accepts --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.respond_viewing((select v::uuid from ctx where k = 'viewing'), 'accept');
reset role;
select is((select link from public.notifications where user_id = 'b2222222-0000-0000-0000-0000000000bb' and kind = 'viewing_confirmed'),
  (select v from ctx where k = 'tenant_link'), 'The tenant is told the request is accepted, linking to the viewing');
select is(pg_temp.n('d2222222-0000-0000-0000-0000000000dd', 'viewing_confirmed'), 1, 'The colleague hears that the owner confirmed it');
select is(pg_temp.n('a2222222-0000-0000-0000-0000000000aa', 'viewing_confirmed'), 0, 'The owner is not notified of their own action');

-- The owner reschedules; the tenant accepts the new time ---------------------------------------
-- now() is fixed inside a test transaction, so step the clock the way separate requests would.
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.respond_viewing((select v::uuid from ctx where k = 'viewing'), 'propose', now() + interval '3 days');
reset role;
select is((select title from public.notifications where user_id = 'b2222222-0000-0000-0000-0000000000bb' and kind = 'viewing_proposed'),
  'Your viewing was rescheduled', 'Rescheduling a confirmed viewing tells the tenant');
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.tenant_viewing_action((select v::uuid from ctx where k = 'viewing'), 'accept_proposed');
reset role;
select is(pg_temp.n('a2222222-0000-0000-0000-0000000000aa', 'viewing_confirmed'), 1, 'The owner hears that the tenant accepted the new time');

-- The tenant reschedules, the owner confirms again: a second "accepted" arrives -----------------
update public.notifications set event_key = event_key || ':earlier' where kind = 'viewing_confirmed';
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.tenant_viewing_action((select v::uuid from ctx where k = 'viewing'), 'change', now() + interval '4 days');
reset role;
select is((select count(*)::int from public.notifications where user_id = 'a2222222-0000-0000-0000-0000000000aa' and title = 'Reschedule request · Unit C7'), 1,
  'A reschedule request from the tenant notifies the owner');
select set_config('request.jwt.claims', '{"sub":"d2222222-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
set local role authenticated;
select public.respond_viewing((select v::uuid from ctx where k = 'viewing'), 'accept');
reset role;
select is(pg_temp.n('b2222222-0000-0000-0000-0000000000bb', 'viewing_confirmed'), 2, 'Confirming again notifies the tenant again');
select ok((select body like 'Mary Manager confirmed Tenant A for %' from public.notifications
  where user_id = 'a2222222-0000-0000-0000-0000000000aa' and kind = 'viewing_confirmed' and event_key like 'viewing_confirmed_team:%'),
  'The owner hears which colleague confirmed it');

-- The tenant cancels -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.tenant_viewing_action((select v::uuid from ctx where k = 'viewing'), 'cancel', null, 'Found another place');
reset role;
select is(pg_temp.n('d2222222-0000-0000-0000-0000000000dd', 'viewing_cancelled'), 1, 'Cancelling notifies the team');

select * from finish();
rollback;
