-- Optional email for in-app updates, chosen per category, and saved-search alerts.
--
-- Email: every app.notify() now also queues one email through the existing outbox, unless the
-- recipient switched that category off. Platform-admin notices keep their own dedicated emails
-- and are not doubled. A burst on one thread (a chat, a ticket) emails once: while an earlier
-- update with the same link is unread and under 30 minutes old, no second email is queued.
--
-- Alerts: saved searches already carried alert_frequency ('instant', 'daily', 'off'). The
-- matching itself runs in the app's job route with the same search code as the search page
-- (src/lib/search-alerts.ts); these functions hand it the searches that are due and record
-- what it found. Both are for the service role only.
--
-- Rollback: restore app.notify from 20261016000001_foundation.sql; drop function
-- public.claim_saved_search_checks(int), public.record_saved_search_alert(uuid, timestamptz, jsonb),
-- app.wants_email(uuid, text), app.notification_category(text); drop table public.notification_settings;
-- alter table public.saved_searches drop column last_alerted_at, drop column last_checked_at.

create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Categories the person does NOT want emailed. Stored as opt-outs so a new category starts on.
  email_off text[] not null default '{}'
    check (email_off <@ array['rent', 'enquiries', 'team', 'listings', 'reports', 'support', 'alerts', 'other']),
  updated_at timestamptz not null default now()
);
create trigger notification_settings_touch before update on public.notification_settings
  for each row execute function app.touch_updated_at();
alter table public.notification_settings enable row level security;
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_settings from anon;

-- Mirrors categoryOf() in src/lib/updates.ts; tests pin both to the same answers.
create or replace function app.notification_category(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kind ~ '^(entry|charge|correction|payment|tenancy)' then 'rent'
    when p_kind ~ '^(message|viewing|enquiry)' then 'enquiries'
    when p_kind ~ '^(invite|access|membership|staff)' then 'team'
    when p_kind ~ '^listing' then 'listings'
    when p_kind ~ '^report' then 'reports'
    when p_kind ~ '^support' then 'support'
    when p_kind ~ '^saved_search' then 'alerts'
    when p_kind ~ '^(registration|onboarding)' then 'admin'
    else 'other'
  end
$$;

create or replace function app.wants_email(p_user uuid, p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_category <> 'admin' and not exists (
    select 1 from public.notification_settings s where s.user_id = p_user and p_category = any (s.email_off))
$$;

create or replace function app.notify(
  p_user uuid, p_org uuid, p_event_key text, p_kind text, p_title text, p_body text, p_link text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_category text := app.notification_category(p_kind);
begin
  insert into public.notifications (user_id, org_id, event_key, kind, title, body, link)
  values (p_user, p_org, p_event_key, p_kind, p_title, p_body, p_link)
  on conflict (user_id, event_key) do nothing
  returning id into v_id;
  if v_id is null or not app.wants_email(p_user, v_category) then return; end if;
  if p_link is not null and exists (
    select 1 from public.notifications n
    where n.user_id = p_user and n.link = p_link and n.id <> v_id and n.read_at is null
      and n.created_at > now() - interval '30 minutes') then
    return;
  end if;
  perform app.queue_delivery(p_org, p_event_key, 'email', (select email from public.profiles where id = p_user),
    'notification', jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link, 'category', v_category));
end $$;

-- ---------------------------------------------------------------------------
-- Saved-search alerts
-- ---------------------------------------------------------------------------

alter table public.saved_searches
  add column last_alerted_at timestamptz,
  add column last_checked_at timestamptz;
-- Existing searches alert only on homes published from now on, never on the back catalogue.
update public.saved_searches set last_alerted_at = now();
alter table public.saved_searches alter column last_alerted_at set default now(),
  alter column last_alerted_at set not null;

-- Daily digests go out from 07:00 Nairobi time.
create or replace function app.todays_digest_time() returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '7 hours') at time zone 'Africa/Nairobi'
$$;

-- Hands the job the searches due a check and stamps them, so overlapping runs never take the
-- same one. Instant: at most every 2 minutes. Daily: once a day, after 07:00 Nairobi time.
create or replace function public.claim_saved_search_checks(p_limit int default 100)
returns table (id uuid, user_id uuid, query text, since timestamptz, checked_at timestamptz)
language sql security definer set search_path = '' as $$
  update public.saved_searches s set last_checked_at = now()
  where s.id in (
    select x.id from public.saved_searches x
    where (x.alert_frequency = 'instant' and coalesce(x.last_checked_at, '-infinity') < now() - interval '2 minutes')
       or (x.alert_frequency = 'daily' and now() >= app.todays_digest_time()
           and coalesce(x.last_checked_at, '-infinity') < app.todays_digest_time())
    order by x.last_checked_at nulls first
    for update skip locked
    limit least(greatest(p_limit, 1), 500))
  returning s.id, s.user_id, coalesce(s.params ->> 'query', ''), s.last_alerted_at, now()
$$;

-- Records one check. `p_homes` are the new matches (newest first) as
-- [{ref, title, area, rent_amount, price_period}]; empty means nothing new. Re-recording the
-- same check is harmless: the notification and the email are keyed to it.
create or replace function public.record_saved_search_alert(p_search uuid, p_through timestamptz, p_homes jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.saved_searches;
  v_n int := coalesce(jsonb_array_length(p_homes), 0);
  v_key text;
  v_id uuid;
  v_first text;
begin
  select * into v_s from public.saved_searches where id = p_search for update;
  if v_s.id is null then return; end if;
  if v_n > 0 and v_s.alert_frequency <> 'off' then
    v_key := 'saved_search:' || v_s.id || ':' || floor(extract(epoch from p_through))::bigint;
    v_first := coalesce(nullif(p_homes -> 0 ->> 'title', ''), p_homes -> 0 ->> 'area');
    insert into public.notifications (user_id, org_id, event_key, kind, title, body, link)
    values (v_s.user_id, null, v_key, 'saved_search_alert',
      v_n || case when v_n = 1 then ' new home for ' else ' new homes for ' end || v_s.label,
      v_first || case when v_n > 1 then ' and ' || (v_n - 1) || ' more' else '' end,
      '/search?' || coalesce(v_s.params ->> 'query', ''))
    on conflict (user_id, event_key) do nothing
    returning id into v_id;
    if v_id is not null and app.wants_email(v_s.user_id, 'alerts') then
      perform app.queue_delivery(null, v_key, 'email', (select email from public.profiles where id = v_s.user_id),
        'saved_search_alert', jsonb_build_object('label', v_s.label, 'query', coalesce(v_s.params ->> 'query', ''),
          'total', v_n, 'homes', (select coalesce(jsonb_agg(t.value), '[]'::jsonb) from (
            select value from jsonb_array_elements(p_homes) limit 10) t)));
    end if;
  end if;
  update public.saved_searches set last_alerted_at = greatest(last_alerted_at, p_through) where id = p_search;
end $$;

revoke execute on function public.claim_saved_search_checks(int),
  public.record_saved_search_alert(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.claim_saved_search_checks(int),
  public.record_saved_search_alert(uuid, timestamptz, jsonb) to service_role;
