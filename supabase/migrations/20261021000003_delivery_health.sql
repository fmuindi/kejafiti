-- IMP-04: overdue notification jobs were invisible.
--
-- Observed: 15 email tasks queued since 16 Oct with 0 attempts, while the admin overview
-- said "No failed deliveries". Causes: no email provider was configured (the worker skips
-- everything without one), nothing ran the worker locally, and the overview counted only
-- status = 'failed'.
--
-- This migration:
--   * holds tasks older than delivery_max_age_hours (default 48) instead of sending them
--     automatically, so a newly configured provider never replays a stale backlog. An
--     admin releases (sends) or cancels each one: the explicit operational decision.
--   * fences finish_delivery_task to tasks still in 'sending', so a worker whose lease
--     expired can't overwrite the result of the worker that took over.
--   * adds admin_delivery_health() for backlog size, oldest due age and overdue count.
--
-- Rollback: restore claim_delivery_tasks / finish_delivery_task / admin_retry_delivery /
-- admin_queue_counts from 20261016000006_storage_admin.sql; drop admin_delivery_health,
-- admin_cancel_delivery and the released_at / released_by columns.

alter table public.delivery_tasks
  add column released_at timestamptz,
  add column released_by uuid references public.profiles (id);

comment on column public.delivery_tasks.released_at is
  'Set when an admin chooses to send a task that was held for being older than delivery_max_age_hours.';

-- Settings with defaults; app_settings rows override them.
create function app.delivery_setting(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(value, '')::numeric from public.app_settings where key = p_key), p_default)
$$;

create or replace function public.claim_delivery_tasks(p_limit int default 20)
returns setof public.delivery_tasks
language sql security definer set search_path = '' as $$
  update public.delivery_tasks t set status = 'sending', attempts = attempts + 1, updated_at = now()
  where t.id in (
    select id from public.delivery_tasks
    where ((status = 'queued' and next_attempt_at <= now())
        or (status = 'sending' and updated_at < now() - interval '10 minutes'))
      and (released_at is not null
        or created_at > now() - make_interval(hours => app.delivery_setting('delivery_max_age_hours', 48)::int))
    order by next_attempt_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100))
  returning t.*
$$;

create or replace function public.finish_delivery_task(p_task uuid, p_ok boolean, p_provider_ref text, p_error text,
  p_retryable boolean default true)
returns void
language sql security definer set search_path = '' as $$
  update public.delivery_tasks set
    status = case when p_ok then 'accepted'
                  when not p_retryable or attempts >= 5 then 'failed'
                  else 'queued' end,
    provider_ref = coalesce(nullif(p_provider_ref, ''), provider_ref),
    last_error = case when p_ok then null else left(p_error, 500) end,
    next_attempt_at = now() + make_interval(mins => power(2, least(attempts, 6))::int),
    -- One-time secrets (invitation tokens) are removed once the message is handed over.
    payload = case when p_ok then payload - 'token' else payload end
  where id = p_task and status = 'sending'
$$;

-- Send now: a failed task, or one held for age. Records who decided.
create or replace function public.admin_retry_delivery(p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.delivery_tasks set status = 'queued', next_attempt_at = now(), released_at = now(), released_by = auth.uid()
  where id = p_task and status in ('failed', 'queued');
end $$;

create function public.admin_cancel_delivery(p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.delivery_tasks set status = 'cancelled', last_error = 'Cancelled by an admin'
  where id = p_task and status in ('failed', 'queued');
end $$;

-- One definition of backlog health for the overview and the deliveries page.
create function public.admin_delivery_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_max_age interval := make_interval(hours => app.delivery_setting('delivery_max_age_hours', 48)::int);
  v_expected interval := make_interval(mins => app.delivery_setting('delivery_expected_delay_minutes', 15)::int);
begin
  perform app.require_admin();
  return (
    with t as (
      select status, attempts, next_attempt_at, updated_at,
        status = 'queued' and released_at is null and created_at <= now() - v_max_age as held
      from public.delivery_tasks
    )
    select jsonb_build_object(
      'due', count(*) filter (where status = 'queued' and not held and next_attempt_at <= now()),
      'scheduled', count(*) filter (where status = 'queued' and not held and next_attempt_at > now()),
      'retrying', count(*) filter (where status = 'queued' and not held and attempts > 0),
      'sending', count(*) filter (where status = 'sending' and updated_at >= now() - interval '10 minutes'),
      'stuck', count(*) filter (where status = 'sending' and updated_at < now() - interval '10 minutes'),
      'held', count(*) filter (where held),
      'failed', count(*) filter (where status = 'failed'),
      'overdue', count(*) filter (where status = 'queued' and not held and next_attempt_at <= now() - v_expected),
      'oldest_due_minutes', floor(extract(epoch from now() - min(next_attempt_at) filter (where status = 'queued' and not held and next_attempt_at <= now())) / 60),
      'accepted_24h', (select count(*) from public.delivery_tasks d where d.status in ('accepted', 'delivered') and d.updated_at > now() - interval '24 hours'),
      'expected_delay_minutes', extract(epoch from v_expected) / 60,
      'max_age_hours', extract(epoch from v_max_age) / 3600)
    from t);
end $$;

create or replace function public.admin_queue_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_health jsonb := public.admin_delivery_health();
begin
  return jsonb_build_object(
    'onboarding', (select count(*) from public.organizations where onboarding_status in ('new', 'in_review', 'changes_needed')),
    'listing_review', (select count(*) from public.listings where status = 'under_review'),
    'listing_reports', (select count(*) from public.listing_reports where status in ('open', 'reviewing')),
    'delivery_failures', (v_health ->> 'failed')::int,
    'delivery_queued', (v_health ->> 'due')::int + (v_health ->> 'scheduled')::int,
    -- Needs attention even when nothing has a failed status.
    'delivery_attention', (v_health ->> 'failed')::int + (v_health ->> 'overdue')::int + (v_health ->> 'held')::int + (v_health ->> 'stuck')::int,
    'oldest_review_hours', (select extract(epoch from now() - min(submitted_at)) / 3600 from public.listings where status = 'under_review'),
    'submitted_today', (select count(*) from public.listings where submitted_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'published_today', (select count(*) from public.listings where published_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'sent_back', (select count(*) from public.listings where status = 'needs_correction')
  );
end $$;

revoke execute on function public.admin_delivery_health(), public.admin_cancel_delivery(uuid) from public, anon;
grant execute on function public.admin_delivery_health(), public.admin_cancel_delivery(uuid) to authenticated, service_role;
revoke execute on function app.delivery_setting(text, numeric) from public, anon;

-- Rows for the deliveries page, with the same state rules as admin_delivery_health().
-- Destinations are masked here so full addresses never reach the browser.
create function public.admin_delivery_tasks(p_limit int default 100)
returns table (id uuid, template text, channel text, destination_masked text, status text, state text,
  attempts int, last_error text, created_at timestamptz, updated_at timestamptz, next_attempt_at timestamptz,
  released_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_max_age interval := make_interval(hours => app.delivery_setting('delivery_max_age_hours', 48)::int);
  v_expected interval := make_interval(mins => app.delivery_setting('delivery_expected_delay_minutes', 15)::int);
begin
  perform app.require_admin();
  return query
  select t.id, t.template, t.channel, regexp_replace(t.destination, '^(.).*(@.*)$', '\1•••\2'), t.status,
    case
      when t.status = 'queued' and t.released_at is null and t.created_at <= now() - v_max_age then 'held'
      when t.status = 'queued' and t.next_attempt_at > now() then case when t.attempts > 0 then 'retrying' else 'scheduled' end
      when t.status = 'queued' and t.next_attempt_at <= now() - v_expected then 'overdue'
      when t.status = 'queued' then 'due'
      when t.status = 'sending' and t.updated_at < now() - interval '10 minutes' then 'stuck'
      else t.status
    end,
    t.attempts, t.last_error, t.created_at, t.updated_at, t.next_attempt_at, t.released_at
  from public.delivery_tasks t
  order by t.created_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;
revoke execute on function public.admin_delivery_tasks(int) from public, anon;
grant execute on function public.admin_delivery_tasks(int) to authenticated, service_role;
