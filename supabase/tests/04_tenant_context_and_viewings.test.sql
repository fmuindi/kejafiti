-- IMP-01/02: tenants see their conversations, viewings and saved homes with listing context,
-- and nobody else's. IMP-03: a viewing whose time has passed reads as expired on both sides
-- and can't be accepted. "Time passing" is simulated by moving the stored times.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values
  ('a2222222-0000-0000-0000-0000000000aa', 'owner4@example.test', '{"full_name":"Wanjiru K"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b2222222-0000-0000-0000-0000000000bb', 'tenant4a@example.test', '{"full_name":"Tenant A"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('b3333333-0000-0000-0000-0000000000bb', 'tenant4b@example.test', '{"full_name":"Tenant B"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('c2222222-0000-0000-0000-0000000000cc', 'admin4@example.test', '{"full_name":"Admin"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('c2222222-0000-0000-0000-0000000000cc');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated, anon;

-- A published listing ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('org', public.create_workspace('Wanjiru Homes', 'landlord'));
insert into ctx values ('listing', public.start_listing(jsonb_build_object('org_id', (select v from ctx where k = 'org'),
  'area', 'Ctxville', 'road', 'Test Rd', 'unit_label', 'C7', 'layout', 'bedsitter_studio')));
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

-- Tenant A enquires, saves the home and asks for a viewing ------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
insert into ctx values ('conv', public.start_conversation((select v from ctx where k = 'ref'), 'Is water included?', gen_random_uuid()));
insert into public.saved_listings (user_id, listing_id) values ('b2222222-0000-0000-0000-0000000000bb', (select v::uuid from ctx where k = 'listing'));
insert into ctx values ('viewing', public.request_viewing((select v from ctx where k = 'ref'), now() + interval '2 days', null, gen_random_uuid()));

-- IMP-01: the inbox lists the thread the tenant can open.
select is((select count(*)::int from public.my_conversations()), 1, 'IMP-01: the tenant inbox lists their conversation');
select is((select listing_ref || ' | ' || listing_title || ' | ' || org_name || ' | ' || advertiser_role from public.my_conversations()),
  (select v from ctx where k = 'ref') || ' | Bedsitter near the stage | Wanjiru Homes | owner',
  'IMP-01/02: the inbox row carries the listing reference, title and advertiser');
select ok((select unit_label is null and tenant_name is null and follow_up is null and property_id is null from public.my_conversations()),
  'IMP-01: staff-only fields are not returned to the tenant');
select is((select last_message from public.my_conversations()), 'Viewing requested · ' || (select app.fmt_eat(requested_start) from public.viewings where id = (select v::uuid from ctx where k = 'viewing')) || ' · not confirmed yet',
  'IMP-01: the preview shows the latest message');

-- IMP-02: viewings and saved homes resolve to a real public reference.
select is((select listing_ref from public.my_viewings()), (select v from ctx where k = 'ref'), 'IMP-02: the viewing links to the listing reference');
select is((select ref from public.my_saved_listings()), (select v from ctx where k = 'ref'), 'IMP-02: the saved home links to the listing reference');
select is((select meeting_instructions from public.my_viewings()), null, 'Meeting instructions stay hidden until the viewing is confirmed');

-- IMP-12: a private note on the saved home.
update public.saved_listings set note = 'Near my office' where user_id = 'b2222222-0000-0000-0000-0000000000bb';
select is((select note from public.my_saved_listings()), 'Near my office', 'IMP-12: the tenant sees their own note');

-- An unrelated tenant gets nothing.
reset role;
select set_config('request.jwt.claims', '{"sub":"b3333333-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.my_conversations()) + (select count(*)::int from public.my_viewings())
  + (select count(*)::int from public.my_saved_listings()), 0, 'IMP-01/02: another tenant sees no conversations, viewings or saved homes');
select is((select count(*)::int from public.saved_listings where note is not null), 0,
  'IMP-12: another tenant cannot read someone else''s saved homes or notes');
update public.saved_listings set note = 'hijack';
-- Check the stored note with full visibility, then continue as the other tenant.
reset role;
select is((select note from public.saved_listings where user_id = 'b2222222-0000-0000-0000-0000000000bb'), 'Near my office',
  'IMP-12: and cannot change them; the owner''s note is untouched');
set local role authenticated;
select is((select count(*)::int from public.conversations where id = (select v::uuid from ctx where k = 'conv')), 0,
  'IMP-01: another tenant cannot open the conversation by id');
select is((select count(*)::int from public.my_conversations((select v::uuid from ctx where k = 'org'))), 0,
  'IMP-01: a non-member asking for a workspace inbox gets nothing');

-- The advertiser's inbox is unchanged.
reset role;
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select is((select unit_label || ' | ' || tenant_name from public.my_conversations((select v::uuid from ctx where k = 'org'))), 'C7 | Tenant A',
  'The advertiser inbox still shows the unit and the tenant');

-- IMP-03: expiry at the time boundary -------------------------------------------------------
reset role;
update public.viewings set requested_start = now() + interval '1 minute' where id = (select v::uuid from ctx where k = 'viewing');
select is((select state from public.viewing_states where id = (select v::uuid from ctx where k = 'viewing')), 'requested',
  'IMP-03: one minute before the time, the request is still open');
update public.viewings set requested_start = now() - interval '1 minute' where id = (select v::uuid from ctx where k = 'viewing');
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select is((select state from public.viewing_states where id = (select v::uuid from ctx where k = 'viewing')), 'expired',
  'IMP-03: one minute after, the advertiser sees it as expired');
select throws_like($$ select public.respond_viewing((select v::uuid from ctx where k = 'viewing'), 'accept') $$, '%has passed%',
  'IMP-03: a past request cannot be accepted on the server');
select is((select status from public.viewings where id = (select v::uuid from ctx where k = 'viewing')), 'requested',
  'IMP-03: the failed accept changed nothing');
reset role;
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select state from public.my_viewings()), 'expired', 'IMP-03: the tenant sees the same expired state');

-- The advertiser suggests another time; the original request stays in the thread history.
reset role;
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.respond_viewing((select v::uuid from ctx where k = 'viewing'), 'propose', now() + interval '3 days') $$,
  'IMP-03: an expired request can get a new suggested time');
select is((select count(*)::int from public.messages where conversation_id = (select v::uuid from ctx where k = 'conv')
  and body like 'Viewing requested%'), 1, 'IMP-03: the original request is kept in the conversation history');

-- The suggested time passes before the tenant answers.
reset role;
update public.viewings set proposed_start = now() - interval '1 minute' where id = (select v::uuid from ctx where k = 'viewing');
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.tenant_viewing_action((select v::uuid from ctx where k = 'viewing'), 'accept_proposed') $$, '%has passed%',
  'IMP-03: the tenant cannot accept a suggested time that has passed');
select lives_ok($$ select public.tenant_viewing_action((select v::uuid from ctx where k = 'viewing'), 'change', now() + interval '4 days') $$,
  'IMP-03: the tenant can ask for a new time instead');
select is((select state from public.my_viewings()), 'requested', 'IMP-03: the new request is open again');

-- IMP-02 AC-3: the thread survives the home being let.
reset role;
select set_config('request.jwt.claims', '{"sub":"a2222222-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;
select public.set_listing_status((select v::uuid from ctx where k = 'listing'), 'mark_let', '2026-10-20');
reset role;
select set_config('request.jwt.claims', '{"sub":"b2222222-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select listing_ref || ' ' || listing_status from public.my_conversations()), (select v from ctx where k = 'ref') || ' let',
  'IMP-02: after the home is let the tenant keeps the thread, with its reference and status');

select * from finish();
rollback;
