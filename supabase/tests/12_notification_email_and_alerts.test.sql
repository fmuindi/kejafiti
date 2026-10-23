-- Optional email for updates (per-category opt-out, one email per burst) and saved-search alerts.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a1200000-0000-0000-0000-0000000000aa', 'owner12@example.test', '{"full_name":"Owner Twelve"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b1200000-0000-0000-0000-0000000000bb', 'tenant12@example.test', '{"full_name":"Tenant Twelve"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c1200000-0000-0000-0000-0000000000cc', 'admin12@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c1200000-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;
create function pg_temp.emails(p_to text, p_template text) returns int language sql as $$
  select count(*)::int from public.delivery_tasks where destination = p_to and template = p_template $$;
create function pg_temp.enquiry_emails(p_to text) returns int language sql as $$
  select count(*)::int from public.delivery_tasks where destination = p_to and template = 'notification'
    and payload ->> 'category' = 'enquiries' $$;

-- Categories match categoryOf() in src/lib/updates.ts ----------------------------------------
select is(
  array[app.notification_category('entry_submitted'), app.notification_category('message'), app.notification_category('viewing_confirmed'),
        app.notification_category('invite_accepted'), app.notification_category('listing_report'), app.notification_category('support_reply'),
        app.notification_category('saved_search_alert'), app.notification_category('registration'), app.notification_category('status')],
  array['rent', 'enquiries', 'enquiries', 'team', 'listings', 'support', 'alerts', 'admin', 'other'],
  'Notification kinds fall into the same categories as the app shows');

-- A published listing -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Twelve Lets', 'landlord'));
insert into ctx values ('listing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Alertville', 'road', 'Test Rd', 'unit_label', 'A1', 'layout', 'bedsitter_studio')));
update public.listings set rent_amount = 9000, deposit_months = 1, title = 'Bedsitter by the alert stage',
  available_from = '2026-11-01', contact_phone = '0712345678'
where id = (select v::uuid from ctx where k = 'listing');
insert into public.listing_photos (listing_id, org_id, storage_path, position)
select (select v::uuid from ctx where k = 'listing'), (select v::uuid from ctx where k = 'org'),
       (select v from ctx where k = 'org') || '/' || (select v from ctx where k = 'listing') || '/p' || g || '.jpg', g
from generate_series(1, 4) g;
select public.submit_listing((select v::uuid from ctx where k = 'listing'));
reset role;
select is((select count(*)::int from public.delivery_tasks where destination = 'admin12@example.test'
    and (template = 'admin_onboarding' or payload ->> 'category' = 'admin')), 1,
  'Admin notices are not doubled: the onboarding notice keeps its one dedicated email');
select set_config('request.jwt.claims', '{"sub":"c1200000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
set local role authenticated;
select public.admin_review_listing((select v::uuid from ctx where k = 'listing'), 'publish', null);
reset role;
insert into ctx values ('ref', (select ref from public.listings where id = (select v::uuid from ctx where k = 'listing')));

-- Messages email the other side, once per burst ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b1200000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('conv', public.start_conversation((select v from ctx where k = 'ref'), 'Is it still available?', gen_random_uuid()));
reset role;
select is(pg_temp.enquiry_emails('owner12@example.test'), 1, 'A new enquiry emails the owner');
select is((select payload ->> 'link' from public.delivery_tasks where destination = 'owner12@example.test' and payload ->> 'category' = 'enquiries'),
  '/w/' || (select v from ctx where k = 'org') || '/enquiries/' || (select v from ctx where k = 'conv'), 'The email links to the conversation');
select set_config('request.jwt.claims', '{"sub":"b1200000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.send_message((select v::uuid from ctx where k = 'conv'), 'Also, is water included?', gen_random_uuid());
reset role;
select is(pg_temp.enquiry_emails('owner12@example.test'), 1, 'A follow-up while the first is unread does not email again');
select is((select count(*)::int from public.notifications where user_id = 'a1200000-0000-0000-0000-0000000000aa' and kind = 'message'), 2,
  'Both messages are still in the in-app updates');
update public.notifications set read_at = now() where user_id = 'a1200000-0000-0000-0000-0000000000aa';
select set_config('request.jwt.claims', '{"sub":"b1200000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select public.send_message((select v::uuid from ctx where k = 'conv'), 'Hello?', gen_random_uuid());
reset role;
select is(pg_temp.enquiry_emails('owner12@example.test'), 2, 'Once the owner has read the earlier ones, the next message emails again');

-- Opting out ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1200000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into public.notification_settings (user_id, email_off) values ('a1200000-0000-0000-0000-0000000000aa', '{enquiries}');
select is((select count(*)::int from public.notification_settings), 1, 'People manage their own email settings');
reset role;
select set_config('request.jwt.claims', '{"sub":"b1200000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.notification_settings), 0, 'and cannot see anyone else''s');
select throws_ok($$ insert into public.notification_settings (user_id) values ('a1200000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'or write them');
update public.notifications set read_at = now();
select public.send_message((select v::uuid from ctx where k = 'conv'), 'Anyone there?', gen_random_uuid());
reset role;
update public.notifications set read_at = now() where user_id = 'a1200000-0000-0000-0000-0000000000aa';
select is(pg_temp.enquiry_emails('owner12@example.test'), 2, 'With enquiries switched off, a message no longer emails');
select is((select count(*)::int from public.notifications where user_id = 'a1200000-0000-0000-0000-0000000000aa' and kind = 'message'), 4,
  'but it still arrives in the app');

-- Saved-search alerts ------------------------------------------------------------------------
insert into public.saved_searches (id, user_id, label, params, alert_frequency, last_alerted_at) values
  ('51200000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-0000000000bb', 'Bedsitters in Alertville', '{"query":"q=Alertville"}', 'instant', now() - interval '1 day'),
  ('51200000-0000-0000-0000-000000000002', 'b1200000-0000-0000-0000-0000000000bb', 'Muted search', '{"query":"q=Elsewhere"}', 'off', now() - interval '1 day');
select set_config('request.jwt.claims', '{"sub":"b1200000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select * from public.claim_saved_search_checks(10) $$, '42501', null, 'Only the job can claim alert checks');
select throws_ok($$ select public.record_saved_search_alert('51200000-0000-0000-0000-000000000001', now(), '[]') $$, '42501', null,
  'or record an alert');
reset role;
select is((select array_agg(id::text) from public.claim_saved_search_checks(10) where user_id = 'b1200000-0000-0000-0000-0000000000bb'),
  array['51200000-0000-0000-0000-000000000001'], 'An instant search is due; a muted one never is');
select is((select count(*)::int from public.claim_saved_search_checks(10) where user_id = 'b1200000-0000-0000-0000-0000000000bb'), 0,
  'A search just checked is not handed out twice');
select public.record_saved_search_alert('51200000-0000-0000-0000-000000000001', now(),
  jsonb_build_array(jsonb_build_object('ref', (select v from ctx where k = 'ref'), 'title', 'Bedsitter by the alert stage', 'area', 'Alertville', 'rent_amount', 9000, 'price_period', 'month')));
select is((select title || ' | ' || link from public.notifications where user_id = 'b1200000-0000-0000-0000-0000000000bb' and kind = 'saved_search_alert'),
  '1 new home for Bedsitters in Alertville | /search?q=Alertville', 'A match arrives in the app, opening the search');
select public.record_saved_search_alert('51200000-0000-0000-0000-000000000001', now(),
  jsonb_build_array(jsonb_build_object('ref', (select v from ctx where k = 'ref'), 'title', 'Bedsitter by the alert stage', 'area', 'Alertville', 'rent_amount', 9000, 'price_period', 'month')));
select is(pg_temp.emails('tenant12@example.test', 'saved_search_alert'), 1, 'and by email, once, even if the job records it twice');
select is((select last_alerted_at from public.saved_searches where id = '51200000-0000-0000-0000-000000000001'), now(),
  'The search remembers how far it has alerted');

select * from finish();
rollback;
