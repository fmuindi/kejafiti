-- Tenant payment habits: how each tenant pays, month by month, for managers and owners.
--
-- Each rent month is settled by confirmed payments applied oldest charge first, the same way
-- the statement balance works (so unallocated credit counts, and a reversed payment never
-- counted). A month is:
--   on_time: fully covered by payments dated on or before its due date;
--   late:    fully covered, but only by a payment after the due date (days_late = how many);
--   overdue: past its due date and still not covered (days_late so far);
--   not_due: not yet due;
--   waived:  nothing left to pay after adjustments.
-- Payments still awaiting confirmation count for nothing, as everywhere else.
--
-- tenant_payment_habits() summarises the last months per tenancy for list views; the app turns
-- the counts into a plain label (pays on time, usually on time, often late, new).
-- tenancy_activity() is one timeline of what happened on a tenancy: payments, messages,
-- follow-ups, tenant reports and adjustments. Staff only: follow-up notes are for the team.
--
-- Rollback: drop function public.tenancy_activity(uuid, int), public.tenant_payment_habits(uuid, uuid, int),
-- public.tenancy_payment_record(uuid, int), app.tenancy_rent_months(uuid).

create or replace function app.tenancy_rent_months(p_tenancy uuid)
returns table (charge_id uuid, period_start date, due_date date, amount numeric, paid_by_due numeric, paid numeric,
  settled_on date, state text, days_late int)
language sql stable security definer set search_path = '' as $$
  with ch as (
    select c.id, c.category, c.period_start, c.due_date, c.created_at,
      c.amount + coalesce((select sum(a.amount) from public.charge_adjustments a where a.charge_id = c.id), 0) as net
    from public.rent_charges c where c.tenancy_id = p_tenancy
  ),
  cum as (
    select ch.*, sum(ch.net) over (order by ch.due_date, ch.created_at, ch.id) as upto from ch
  ),
  pay as (
    select e.paid_on, sum(e.amount) over (order by e.paid_on, e.confirmed_at, e.id) as upto
    from public.payment_entries e
    where e.tenancy_id = p_tenancy and e.status = 'confirmed'
  ),
  total as (select coalesce(max(upto), 0) as paid from pay)
  select c.id, c.period_start, c.due_date, c.net,
    greatest(0, least(c.net, coalesce((select max(p.upto) from pay p where p.paid_on <= c.due_date), 0) - (c.upto - c.net))),
    greatest(0, least(c.net, (select paid from total) - (c.upto - c.net))),
    s.settled_on,
    case when c.net <= 0 then 'waived'
         when s.settled_on is not null and s.settled_on <= c.due_date then 'on_time'
         when s.settled_on is not null then 'late'
         when c.due_date >= app.today() then 'not_due'
         else 'overdue' end,
    case when c.net <= 0 then 0
         when s.settled_on is not null then greatest(s.settled_on - c.due_date, 0)
         when c.due_date >= app.today() then 0
         else app.today() - c.due_date end
  from cum c
  cross join lateral (select case when c.net <= 0 then null else (select min(p.paid_on) from pay p where p.upto >= c.upto) end as settled_on) s
  where c.category = 'rent'
$$;

-- One tenancy's rent months, latest p_months, oldest first. Anyone who can see the property.
create or replace function public.tenancy_payment_record(p_tenancy uuid, p_months int default 12)
returns table (period_start date, due_date date, amount numeric, paid_by_due numeric, paid numeric,
  settled_on date, state text, days_late int)
language plpgsql stable security definer set search_path = '' as $$
declare v_property uuid;
begin
  select property_id into v_property from public.tenancies where id = p_tenancy;
  if v_property is null or not app.can(v_property, 'view') then
    perform app.raise_error('forbidden', 'You don''t have access to this tenancy.');
  end if;
  return query
    select m.period_start, m.due_date, m.amount, m.paid_by_due, m.paid, m.settled_on, m.state, m.days_late
    from (select * from app.tenancy_rent_months(p_tenancy) order by period_start desc
          limit greatest(least(coalesce(p_months, 12), 36), 1)) m
    order by m.period_start;
end $$;

-- Payment habits of every current tenancy the person can see, over the last p_months rent months.
create or replace function public.tenant_payment_habits(p_org uuid, p_property uuid default null, p_months int default 12)
returns table (tenancy_id uuid, property_id uuid, property_name text, unit_id uuid, unit_label text, tenant_name text,
  start_date date, months_due int, on_time int, late int, overdue int, avg_days_late numeric, max_days_late int,
  on_time_streak int, recent text[], last_paid_on date, owed numeric, promises_kept int, promises_broken int,
  reports int)
language sql stable security definer set search_path = '' as $$
  with props as (
    select p.id, p.name from public.properties p
    where p.org_id = p_org and p.archived_at is null and (p_property is null or p.id = p_property)
      and app.can(p.id, 'view')
  ),
  t as (
    select tc.id, tc.property_id, pr.name as property_name, tc.unit_id, u.label, tn.full_name, tc.start_date
    from public.tenancies tc
    join props pr on pr.id = tc.property_id
    join public.units u on u.id = tc.unit_id
    join public.tenants tn on tn.id = tc.tenant_id
    where tc.status = 'active'
  ),
  m as (
    select t.id as tenancy_id, r.*,
      row_number() over (partition by t.id order by r.period_start desc) as n
    from t cross join lateral app.tenancy_rent_months(t.id) r
    where r.state <> 'not_due'
  ),
  recent as (select * from m where n <= greatest(least(coalesce(p_months, 12), 36), 1))
  select t.id, t.property_id, t.property_name, t.unit_id, t.label, t.full_name, t.start_date,
    (select count(*)::int from recent r where r.tenancy_id = t.id and r.state <> 'waived'),
    (select count(*)::int from recent r where r.tenancy_id = t.id and r.state = 'on_time'),
    (select count(*)::int from recent r where r.tenancy_id = t.id and r.state = 'late'),
    (select count(*)::int from recent r where r.tenancy_id = t.id and r.state = 'overdue'),
    (select round(avg(r.days_late), 1) from recent r where r.tenancy_id = t.id and r.state = 'late'),
    (select max(r.days_late) from recent r where r.tenancy_id = t.id and r.state in ('late', 'overdue')),
    -- Consecutive on-time months, counting back from the latest due month (waived months skipped).
    (select count(*) from m r where r.tenancy_id = t.id and r.state = 'on_time'
       and r.n < coalesce((select min(r2.n) from m r2 where r2.tenancy_id = t.id and r2.state not in ('on_time', 'waived')), 2147483647))::int,
    -- The last six due months, oldest first, for the small strip in lists.
    coalesce((select array_agg(r.state order by r.period_start) from m r where r.tenancy_id = t.id and r.n <= 6), '{}'),
    (select max(e.paid_on) from public.payment_entries e where e.tenancy_id = t.id and e.status = 'confirmed'),
    greatest(app.tenancy_balance(t.id), 0),
    (select count(*)::int from public.rent_follow_ups f
     where f.tenancy_id = t.id and f.kind = 'promised' and f.due_on is not null
       and exists (select 1 from public.payment_entries e where e.tenancy_id = t.id and e.status = 'confirmed'
                   and e.paid_on between (f.created_at at time zone 'Africa/Nairobi')::date - 1 and f.due_on)),
    (select count(*)::int from public.rent_follow_ups f
     where f.tenancy_id = t.id and f.kind = 'promised' and f.due_on is not null and f.due_on < app.today()
       and not exists (select 1 from public.payment_entries e where e.tenancy_id = t.id and e.status = 'confirmed'
                       and e.paid_on between (f.created_at at time zone 'Africa/Nairobi')::date - 1 and f.due_on)),
    (select count(*)::int from public.payment_reports pr2 where pr2.tenancy_id = t.id and pr2.status <> 'withdrawn')
  from t
  order by t.property_name, t.label
$$;

-- What happened on a tenancy, newest first: payments, messages, follow-ups, reports, adjustments.
create or replace function public.tenancy_activity(p_tenancy uuid, p_limit int default 40)
returns table (at timestamptz, kind text, title text, detail text, tone text, ref_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_property uuid;
begin
  select property_id into v_property from public.tenancies where id = p_tenancy;
  if v_property is null or not app.can(v_property, 'view') then
    perform app.raise_error('forbidden', 'You don''t have access to this tenancy.');
  end if;
  return query
  select * from (
    select e.confirmed_at, 'payment_confirmed'::text, 'Payment confirmed · ' || app.money(e.amount),
      e.ref || ' · paid ' || to_char(e.paid_on, 'FMDD Mon YYYY') || coalesce(' · ' || e.reference, ''), 'success'::text, e.id
    from public.payment_entries e where e.tenancy_id = p_tenancy and e.confirmed_at is not null
    union all
    select e.submitted_at, 'payment_submitted', 'Payment submitted · ' || app.money(e.amount),
      e.ref || ' · paid ' || to_char(e.paid_on, 'FMDD Mon YYYY') || ' · awaiting confirmation', 'waiting', e.id
    from public.payment_entries e where e.tenancy_id = p_tenancy and e.submitted_at is not null and e.status = 'awaiting_confirmation'
    union all
    select e.decided_at, 'payment_not_accepted', 'Payment not accepted · ' || app.money(e.amount),
      e.ref || coalesce(' · ' || e.decision_reason, ''), 'error', e.id
    from public.payment_entries e where e.tenancy_id = p_tenancy and e.status = 'not_accepted' and e.decided_at is not null
    union all
    select e.reversed_at, 'payment_reversed', 'Payment reversed · ' || app.money(e.amount),
      e.ref || coalesce(' · ' || e.reversal_reason, ''), 'error', e.id
    from public.payment_entries e where e.tenancy_id = p_tenancy and e.status = 'reversed'
    union all
    select m.created_at, 'message_' || m.kind,
      case m.kind when 'invoice' then 'Invoice sent' when 'reminder' then 'Reminder sent' else 'Message sent' end,
      m.subject, 'info', m.id
    from public.tenant_messages m where m.tenancy_id = p_tenancy
    union all
    select f.created_at, 'follow_up_' || f.kind,
      case f.kind when 'contacted' then 'Contacted' when 'promised' then 'Promised to pay' || coalesce(' by ' || to_char(f.due_on, 'FMDD Mon'), '')
                  when 'reported' then 'Says they paid' else 'Note' end,
      coalesce(f.note, ''), case f.kind when 'promised' then 'waiting' else 'neutral' end, f.id
    from public.rent_follow_ups f where f.tenancy_id = p_tenancy
    union all
    select r.created_at, 'reported_missing', 'Tenant reported a missing payment · ' || app.money(r.amount),
      'Paid ' || to_char(r.paid_on, 'FMDD Mon YYYY') || coalesce(' · ' || r.reference, ''), 'waiting', r.id
    from public.payment_reports r where r.tenancy_id = p_tenancy
    union all
    select r.answered_at, 'report_' || r.status,
      case r.status when 'matched' then 'Reported payment found' when 'not_found' then 'Reported payment not found' else 'Report withdrawn by tenant' end,
      app.money(r.amount) || coalesce(' · ' || r.reply, ''), case r.status when 'matched' then 'success' when 'not_found' then 'error' else 'neutral' end, r.id
    from public.payment_reports r where r.tenancy_id = p_tenancy and r.status <> 'open' and r.answered_at is not null
    union all
    select a.created_at, 'adjustment', case when a.amount < 0 then 'Charge reduced · ' else 'Charge added · ' end || app.money(abs(a.amount)),
      a.reason, 'neutral', a.id
    from public.charge_adjustments a join public.rent_charges c on c.id = a.charge_id where c.tenancy_id = p_tenancy
  ) x(at, kind, title, detail, tone, ref_id)
  where x.at is not null
  order by x.at desc
  limit greatest(least(coalesce(p_limit, 40), 200), 1);
end $$;

revoke execute on function public.tenancy_payment_record(uuid, int), public.tenant_payment_habits(uuid, uuid, int),
  public.tenancy_activity(uuid, int) from public, anon;
grant execute on function public.tenancy_payment_record(uuid, int), public.tenant_payment_habits(uuid, uuid, int),
  public.tenancy_activity(uuid, int) to authenticated;
revoke execute on function app.tenancy_rent_months(uuid) from public;
