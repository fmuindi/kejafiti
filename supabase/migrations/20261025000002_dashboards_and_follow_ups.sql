-- Manager and owner dashboards (blueprint v1.0, 25 Oct 2026: pages 7, 8, 14-16).
--
-- Follow-ups: a balance leads to an action. Staff record that they contacted a tenant, that
-- the tenant promised to pay (by a date), or that the tenant reported a payment awaiting a
-- check, with an optional due date and a responsible person. A follow-up is a note and a
-- task; it never changes a balance. Notes are staff-only and never shown to the tenant.
--
-- owing_tenancies(): who owes now, the list behind every "outstanding" figure. Owed = the
-- unpaid part of charges already due, capped by the statement balance (so unallocated credit
-- counts); pending submissions are shown beside it and settle nothing.
-- portfolio_position(): the period position per property, for the owner's comparison.
-- workspace_search(): unit, tenant, phone, email or payment reference, within the properties
-- the person can see.
--
-- Rollback: drop function public.workspace_search(uuid, text), public.portfolio_position(uuid, date),
-- public.owing_tenancies(uuid, uuid, int), public.resolve_follow_up(uuid, text), public.add_follow_up(jsonb);
-- drop table public.rent_follow_ups.

create table public.rent_follow_ups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  tenancy_id uuid not null references public.tenancies (id),
  -- contacted: we reached the tenant; promised: the tenant promised to pay; reported: the tenant
  -- says they paid and it needs checking; note: anything else.
  kind text not null check (kind in ('contacted', 'promised', 'reported', 'note')),
  note text check (length(note) <= 1000),
  promised_amount numeric(12, 2) check (promised_amount > 0),
  due_on date,
  assigned_to uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  resolution text check (length(resolution) <= 500),
  client_request_id uuid not null unique
);
create index rent_follow_ups_tenancy_idx on public.rent_follow_ups (tenancy_id, created_at desc);
create index rent_follow_ups_open_idx on public.rent_follow_ups (org_id, due_on) where resolved_at is null;

alter table public.rent_follow_ups enable row level security;
create policy rent_follow_ups_select on public.rent_follow_ups for select to authenticated
  using (app.can(property_id, 'view'));

create or replace function app.can_follow_up(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can(p_property, 'manage_tenancies') or app.can(p_property, 'enter_payments') or app.can(p_property, 'confirm')
$$;

-- p: { client_request_id, tenancy_id, kind, note?, due_on?, promised_amount?, assigned_to? }
-- assigned_to defaults to the person adding it; null in the payload with "anyone": true leaves it
-- for anyone on the property. Retrying the same client_request_id returns the same follow-up.
create or replace function public.add_follow_up(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_req uuid;
  v_tenancy uuid;
  v_t record;
  v_kind text := p ->> 'kind';
  v_note text := nullif(trim(coalesce(p ->> 'note', '')), '');
  v_due date;
  v_amount numeric;
  v_assignee uuid;
  v_id uuid;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  begin
    v_req := (p ->> 'client_request_id')::uuid;
    v_tenancy := (p ->> 'tenancy_id')::uuid;
    v_due := nullif(p ->> 'due_on', '')::date;
    v_amount := nullif(p ->> 'promised_amount', '')::numeric;
    v_assignee := nullif(p ->> 'assigned_to', '')::uuid;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform app.raise_error('validation', 'Something in the follow-up isn''t valid. Check the date and amount.');
  end;
  select id into v_id from public.rent_follow_ups where client_request_id = v_req;
  if v_id is not null then return v_id; end if;

  select t.id, t.org_id, t.property_id into v_t from public.tenancies t where t.id = v_tenancy;
  if v_t.id is null or not app.can_follow_up(v_t.property_id) then
    perform app.raise_error('forbidden', 'You need rent or tenancy permission for this property to add follow-ups.');
  end if;
  if v_req is null then perform app.raise_error('validation', 'Something in the follow-up isn''t valid. Reload and try again.'); end if;
  if v_kind is null or v_kind not in ('contacted', 'promised', 'reported', 'note') then
    perform app.raise_error('validation', 'Choose what happened: contacted, promised to pay, reported a payment, or a note.');
  end if;
  if v_kind = 'note' and v_note is null then perform app.raise_error('validation', 'Write the note.'); end if;
  if v_kind = 'promised' and v_due is null then perform app.raise_error('validation', 'Enter the date the tenant promised to pay by.'); end if;
  if length(v_note) > 1000 then perform app.raise_error('validation', 'Keep the note to 1,000 characters.'); end if;
  if v_amount is not null and (v_amount <= 0 or v_amount > 99999999) then
    perform app.raise_error('validation', 'Enter the promised amount in KSh, or leave it empty.');
  end if;
  if v_due is not null and (v_due < app.today() - 1 or v_due > app.today() + 366) then
    perform app.raise_error('validation', 'Choose a follow-up date from today to a year ahead.');
  end if;
  if v_assignee is null and coalesce((p ->> 'anyone')::boolean, false) is false then v_assignee := auth.uid(); end if;
  if v_assignee is not null and not exists (
      select 1 from public.memberships m
      where m.org_id = v_t.org_id and m.user_id = v_assignee and m.status = 'active'
        and (m.role in ('owner', 'agency_admin') or m.all_properties
             or exists (select 1 from public.membership_properties mp where mp.membership_id = m.id and mp.property_id = v_t.property_id))) then
    perform app.raise_error('validation', 'That person isn''t on the team for this property.');
  end if;

  insert into public.rent_follow_ups (org_id, property_id, tenancy_id, kind, note, promised_amount, due_on,
    assigned_to, created_by, client_request_id)
  values (v_t.org_id, v_t.property_id, v_t.id, v_kind, v_note, v_amount, v_due, v_assignee, auth.uid(), v_req)
  returning id into v_id;
  perform app.audit(v_t.org_id, v_t.property_id, 'follow_up_added', 'tenancy', v_t.id::text,
    jsonb_build_object('follow_up', v_id, 'kind', v_kind, 'due_on', v_due, 'assigned_to', v_assignee));
  if v_assignee is not null and v_assignee <> auth.uid() then
    perform app.notify(v_assignee, v_t.org_id, 'follow_up:' || v_id, 'tenancy_follow_up',
      'Follow-up assigned to you',
      coalesce(to_char(v_due, 'FMDD Mon') || ': ', '') || coalesce(v_note, 'A tenant balance needs a follow-up.'),
      (select '/w/' || v_t.org_id || '/rent/' || v_t.property_id || '/units/' || t.unit_id || '#follow-ups'
       from public.tenancies t where t.id = v_t.id));
  end if;
  return v_id;
end $$;

create or replace function public.resolve_follow_up(p_id uuid, p_resolution text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_f public.rent_follow_ups;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  select * into v_f from public.rent_follow_ups where id = p_id for update;
  if v_f.id is null or not app.can_follow_up(v_f.property_id) then
    perform app.raise_error('forbidden', 'You need rent or tenancy permission for this property to close follow-ups.');
  end if;
  if v_f.resolved_at is not null then return; end if;
  if length(p_resolution) > 500 then perform app.raise_error('validation', 'Keep the outcome to 500 characters.'); end if;
  update public.rent_follow_ups set resolved_at = now(), resolved_by = auth.uid(),
    resolution = nullif(trim(coalesce(p_resolution, '')), '')
  where id = p_id;
  perform app.audit(v_f.org_id, v_f.property_id, 'follow_up_resolved', 'tenancy', v_f.tenancy_id::text,
    jsonb_build_object('follow_up', p_id));
end $$;

-- Who owes now. Only properties the person can see; former tenancies are included and flagged.
create or replace function public.owing_tenancies(p_org uuid, p_property uuid default null, p_limit int default 100)
returns table (tenancy_id uuid, tenancy_status text, property_id uuid, property_name text, unit_id uuid, unit_label text,
  tenant_name text, owed numeric, oldest_due date, pending_amount numeric, open_follow_ups int, next_follow_up date,
  last_contact_at timestamptz, last_contact_kind text, last_reminder_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with props as (
    select p.id, p.name from public.properties p
    where p.org_id = p_org and p.archived_at is null and (p_property is null or p.id = p_property)
      and app.can(p.id, 'view')
  ),
  due as (
    select t.id as tenancy_id, sum(l.net - l.paid) as overdue, min(l.due_date) as oldest_due
    from public.tenancies t
    cross join lateral app.tenancy_charge_lines(t.id) l
    where t.property_id in (select id from props) and l.due_date < app.today() and l.net - l.paid > 0
    group by t.id
  ),
  owing as (
    select d.tenancy_id, least(d.overdue, app.tenancy_balance(d.tenancy_id)) as owed, d.oldest_due from due d
  )
  select t.id, t.status, t.property_id, pr.name, u.id, u.label, tn.full_name, o.owed, o.oldest_due,
    coalesce((select sum(e.amount) from public.payment_entries e where e.tenancy_id = t.id and e.status = 'awaiting_confirmation'), 0),
    (select count(*)::int from public.rent_follow_ups f where f.tenancy_id = t.id and f.resolved_at is null),
    (select min(f.due_on) from public.rent_follow_ups f where f.tenancy_id = t.id and f.resolved_at is null),
    lf.created_at, lf.kind,
    (select max(m.created_at) from public.tenant_messages m where m.tenancy_id = t.id and m.kind = 'reminder')
  from owing o
  join public.tenancies t on t.id = o.tenancy_id
  join props pr on pr.id = t.property_id
  join public.units u on u.id = t.unit_id
  join public.tenants tn on tn.id = t.tenant_id
  left join lateral (select f.created_at, f.kind from public.rent_follow_ups f where f.tenancy_id = t.id
                     order by f.created_at desc limit 1) lf on true
  where o.owed > 0
  order by t.status = 'ended', o.owed desc, o.oldest_due
  limit greatest(least(coalesce(p_limit, 100), 500), 1)
$$;

-- The period position of each property the person can see, for the owner's comparison.
create or replace function public.portfolio_position(p_org uuid, p_period date)
returns table (property_id uuid, property_name text, billed numeric, settled numeric, collection_rate numeric,
  outstanding numeric, overdue numeric, pending_count int, occupied int, lettable int, unavailable int, units_total int,
  owed_now numeric, owing_tenancies int, last_confirmed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, s.billed, s.settled, s.collection_rate, s.outstanding, s.overdue, s.pending_count,
    s.occupied, s.lettable, s.unavailable, s.units_total,
    coalesce((select sum(o.owed) from public.owing_tenancies(p_org, p.id, 500) o), 0),
    (select count(*)::int from public.owing_tenancies(p_org, p.id, 500) o),
    (select max(e.confirmed_at) from public.payment_entries e where e.property_id = p.id and e.confirmed_at is not null)
  from public.properties p
  cross join lateral public.rent_summary(p_org, p.id, p_period, null) s
  where p.org_id = p_org and p.archived_at is null and app.can(p.id, 'view')
  order by p.name
$$;

-- Unit, tenant (name, phone, email) or payment reference, within visible properties.
create or replace function public.workspace_search(p_org uuid, p_q text)
returns table (kind text, title text, detail text, property_id uuid, unit_id uuid, entry_id uuid)
language sql stable security definer set search_path = '' as $$
  with q as (
    select lower(trim(coalesce(p_q, ''))) as raw,
      '%' || replace(replace(replace(lower(trim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
      nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '') as digits
  ),
  props as (
    select p.id, p.name from public.properties p
    where p.org_id = p_org and p.archived_at is null and app.can(p.id, 'view')
  ),
  units as (
    select 'unit'::text as kind, 'Unit ' || u.label || coalesce(' · ' || tn.full_name, ' · vacant') as title,
      pr.name as detail, u.property_id, u.id as unit_id, null::uuid as entry_id,
      case when lower(u.label) = (select raw from q) then 0 when lower(u.label) like (select raw from q) || '%' then 1 else 2 end as rank
    from public.units u
    join props pr on pr.id = u.property_id
    left join public.tenancies t on t.unit_id = u.id and t.status = 'active'
    left join public.tenants tn on tn.id = t.tenant_id
    where lower(u.label) like (select pat from q)
       or lower(tn.full_name) like (select pat from q)
       or lower(coalesce(tn.email, '')) like (select pat from q)
       or ((select length(digits) from q) >= 4 and regexp_replace(coalesce(tn.phone, ''), '\D', '', 'g') like '%' || (select digits from q) || '%')
  ),
  former as (
    select 'tenant'::text, tn.full_name || ' · former tenant', 'Unit ' || u.label || ' · ' || pr.name,
      t.property_id, u.id, null::uuid, 3
    from public.tenancies t
    join props pr on pr.id = t.property_id
    join public.units u on u.id = t.unit_id
    join public.tenants tn on tn.id = t.tenant_id
    where t.status = 'ended' and lower(tn.full_name) like (select pat from q)
  ),
  payments as (
    select 'payment'::text, e.ref || ' · KSh ' || to_char(e.amount, case when e.amount = trunc(e.amount) then 'FM999,999,999,990' else 'FM999,999,999,990.00' end),
      'Unit ' || u.label || ' · ' || pr.name || ' · ' || replace(e.status, '_', ' '),
      e.property_id, e.unit_id, e.id, case when lower(e.ref) = (select raw from q) then 0 else 2 end
    from public.payment_entries e
    join props pr on pr.id = e.property_id
    join public.units u on u.id = e.unit_id
    where lower(e.ref) like (select pat from q) or lower(coalesce(e.reference, '')) like (select pat from q)
  )
  select kind, title, detail, property_id, unit_id, entry_id from (
    select * from units union all select * from former union all select * from payments
  ) r
  where length((select raw from q)) >= 2
  order by rank, title
  limit 20
$$;

revoke execute on function public.add_follow_up(jsonb), public.resolve_follow_up(uuid, text),
  public.owing_tenancies(uuid, uuid, int), public.portfolio_position(uuid, date), public.workspace_search(uuid, text)
  from public, anon;
grant execute on function public.add_follow_up(jsonb), public.resolve_follow_up(uuid, text),
  public.owing_tenancies(uuid, uuid, int), public.portfolio_position(uuid, date), public.workspace_search(uuid, text)
  to authenticated;
