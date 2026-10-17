-- Rent workflows. One owner for each business rule: these functions are the only way to
-- create tenancies, charges, payment entries, confirmations and corrections. The app calls
-- them through PostgREST RPC with the signed-in user's token; each one re-checks
-- membership, property assignment and the specific permission.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function app.period_label(p_period date) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_period, 'FMMonth YYYY')
$$;

create or replace function app.money(p numeric) returns text
language sql immutable set search_path = '' as $$
  select 'KSh ' || to_char(p, 'FM999,999,999,990.##')
$$;

create or replace function app.touch_membership(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  update public.memberships set last_active_at = now()
  where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

-- People who receive "awaiting your confirmation" alerts for a property.
create or replace function app.property_confirmers(p_property uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with staff as (
    select m.user_id from public.memberships m
    join public.properties p on p.org_id = m.org_id
    where p.id = p_property and m.status = 'active' and m.user_id is not null
      and m.role not in ('owner', 'agency_admin') and m.can_confirm
      and (m.all_properties or exists (select 1 from public.membership_properties mp
                                        where mp.membership_id = m.id and mp.property_id = p.id))
  )
  select user_id from staff
  union
  select m.user_id from public.memberships m join public.properties p on p.org_id = m.org_id
  where p.id = p_property and m.status = 'active' and m.role in ('owner', 'agency_admin')
    and not exists (select 1 from staff)
$$;

create or replace function app.charge_net(p_charge uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select c.amount + coalesce((select sum(a.amount) from public.charge_adjustments a where a.charge_id = c.id), 0)
  from public.rent_charges c where c.id = p_charge
$$;

create or replace function app.charge_allocated(p_charge uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(x.amount), 0) from public.allocations x where x.charge_id = p_charge
$$;

create or replace function app.entry_unallocated(p_entry uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when e.status = 'confirmed'
    then e.amount - coalesce((select sum(x.amount) from public.allocations x where x.entry_id = e.id), 0)
    else 0 end
  from public.payment_entries e where e.id = p_entry
$$;

create or replace function app.entry_event(
  p_entry uuid, p_action text, p_reason text default null, p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.entry_events (entry_id, org_id, property_id, action, actor_id, reason, details)
  select e.id, e.org_id, e.property_id, p_action, auth.uid(), p_reason, coalesce(p_details, '{}'::jsonb)
  from public.payment_entries e where e.id = p_entry
$$;

-- Validates allocation lines for a tenancy. When p_lock is true, the referenced charges are
-- locked and each line is checked against the charge's current outstanding balance, so two
-- simultaneous confirmations cannot over-settle the same charge.
create or replace function app.validate_allocations(
  p_tenancy uuid, p_amount numeric, p_allocs jsonb, p_lock boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_line record;
  v_total numeric := 0;
  v_charge record;
  v_outstanding numeric;
  v_out jsonb := '[]'::jsonb;
begin
  if p_allocs is null or jsonb_typeof(p_allocs) <> 'array' then
    perform app.raise_error('invalid_allocations', 'Choose which rent periods this payment applies to.');
  end if;

  for v_line in
    select (x ->> 'charge_id')::uuid as charge_id, (x ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_allocs) x
  loop
    continue when v_line.amount is null or v_line.amount = 0;
    if v_line.amount < 0 or round(v_line.amount, 2) <> v_line.amount then
      perform app.raise_error('invalid_allocations', 'Each amount applied must be a positive amount in KSh.');
    end if;
    if v_out @> jsonb_build_array(jsonb_build_object('charge_id', v_line.charge_id)) then
      perform app.raise_error('invalid_allocations', 'Each rent period can appear only once.');
    end if;

    if p_lock then
      select c.* into v_charge from public.rent_charges c where c.id = v_line.charge_id for update;
    else
      select c.* into v_charge from public.rent_charges c where c.id = v_line.charge_id;
    end if;
    if v_charge.id is null or v_charge.tenancy_id <> p_tenancy then
      perform app.raise_error('invalid_allocations', 'A selected charge does not belong to this tenancy.');
    end if;

    if p_lock then
      v_outstanding := app.charge_net(v_charge.id) - app.charge_allocated(v_charge.id);
      if v_line.amount > v_outstanding then
        perform app.raise_error('over_allocation', format(
          '%s has only %s left. Reduce the amount applied to it.',
          case when v_charge.category = 'rent' then app.period_label(v_charge.period_start) || ' rent'
               else coalesce(v_charge.description, 'This charge') end,
          app.money(greatest(v_outstanding, 0))));
      end if;
    end if;

    v_total := v_total + v_line.amount;
    v_out := v_out || jsonb_build_array(jsonb_build_object('charge_id', v_line.charge_id, 'amount', v_line.amount));
  end loop;

  if v_total > p_amount then
    perform app.raise_error('over_allocation',
      'The amounts applied add up to more than the payment. Any extra is kept as tenant credit instead.');
  end if;
  return v_out;
end $$;

-- Posts a confirmation: allocations and status change happen together in one transaction.
-- The caller must hold a row lock on the entry and must have checked permissions.
create or replace function app.post_confirmation(p_entry uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.payment_entries;
  v_allocs jsonb;
  v_line record;
  v_policy text;
  v_applied numeric := 0;
begin
  select * into v_entry from public.payment_entries where id = p_entry;
  select p.evidence_policy into v_policy from public.properties p where p.id = v_entry.property_id;
  if v_policy = 'required' and not exists (
      select 1 from public.attachments a where a.entry_id = p_entry and a.removed_at is null) then
    perform app.raise_error('evidence_required',
      'This property asks for a receipt or other evidence before an entry is confirmed.');
  end if;

  v_allocs := app.validate_allocations(v_entry.tenancy_id, v_entry.amount, v_entry.proposed_allocations, true);

  for v_line in select (x ->> 'charge_id')::uuid as charge_id, (x ->> 'amount')::numeric as amount
                from jsonb_array_elements(v_allocs) x
  loop
    insert into public.allocations (org_id, property_id, tenancy_id, entry_id, charge_id, amount, posted_by)
    values (v_entry.org_id, v_entry.property_id, v_entry.tenancy_id, v_entry.id, v_line.charge_id,
            v_line.amount, auth.uid());
    v_applied := v_applied + v_line.amount;
  end loop;

  update public.payment_entries set
    status = 'confirmed',
    proposed_allocations = v_allocs,
    confirmed_by = auth.uid(), confirmed_at = now(),
    decided_by = auth.uid(), decided_at = now(),
    confirm_acknowledged = true,
    assigned_to = null,
    version = version + 1
  where id = p_entry;

  perform app.entry_event(p_entry, 'confirmed', null,
    jsonb_build_object('allocations', v_allocs, 'credit', v_entry.amount - v_applied));

  if v_entry.submitted_by is not null and v_entry.submitted_by <> auth.uid() then
    perform app.notify(v_entry.submitted_by, v_entry.org_id, 'entry_confirmed:' || v_entry.id, 'entry_confirmed',
      'Entry confirmed', v_entry.ref || ' · ' || app.money(v_entry.amount) || ' was confirmed.',
      '/w/' || v_entry.org_id || '/rent/' || v_entry.property_id || '/entries/' || v_entry.id);
  end if;

  return jsonb_build_object('id', v_entry.id, 'ref', v_entry.ref, 'status', 'confirmed',
    'applied', v_applied, 'credit', v_entry.amount - v_applied);
end $$;

create or replace function app.notify_confirmers(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.payment_entries;
  v_unit text;
  v_user uuid;
begin
  select * into v_entry from public.payment_entries where id = p_entry;
  select u.label into v_unit from public.units u where u.id = v_entry.unit_id;
  for v_user in select app.property_confirmers(v_entry.property_id) loop
    continue when v_user = auth.uid();
    perform app.notify(v_user, v_entry.org_id, 'entry_submitted:' || v_entry.id || ':' || v_entry.version,
      'entry_submitted', 'Entry awaiting your confirmation',
      'Unit ' || v_unit || ' · ' || app.money(v_entry.amount) || '. Review after checking externally.',
      '/w/' || v_entry.org_id || '/rent/inbox');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tenancy setup
-- ---------------------------------------------------------------------------

create or replace function public.create_tenancy(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_unit public.units;
  v_property public.properties;
  v_tenant_id uuid;
  v_tenancy_id uuid;
  v_start date := (p ->> 'start_date')::date;
  v_rent numeric := (p ->> 'rent_amount')::numeric;
  v_due int;
  v_opening numeric := coalesce(nullif(p ->> 'opening_balance', '')::numeric, 0);
  v_opening_date date := coalesce(nullif(p ->> 'opening_balance_date', '')::date, v_start);
  v_entry_id uuid;
begin
  select * into v_unit from public.units where id = (p ->> 'unit_id')::uuid;
  if v_unit.id is null then
    perform app.raise_error('not_found', 'Unit not found.');
  end if;
  perform app.require(v_unit.property_id, 'manage_tenancies');
  select * into v_property from public.properties where id = v_unit.property_id;
  v_due := coalesce(nullif(p ->> 'due_day', '')::int, v_property.rent_due_day);

  if v_start is null then
    perform app.raise_error('validation', 'Enter the tenancy start date.');
  end if;
  if v_rent is null or v_rent <= 0 then
    perform app.raise_error('validation', 'Enter the monthly rent in KSh.');
  end if;
  if exists (select 1 from public.tenancies t where t.unit_id = v_unit.id and t.status = 'active') then
    perform app.raise_error('unit_has_tenancy', 'This unit already has a current tenancy. End it first.');
  end if;
  if v_opening <> 0 and length(trim(coalesce(p ->> 'opening_balance_note', ''))) < 3 then
    perform app.raise_error('validation', 'Explain the opening balance, for example "Arrears at 30 Sep cut-off".');
  end if;

  if nullif(p ->> 'tenant_id', '') is not null then
    select t.id into v_tenant_id from public.tenants t
    where t.id = (p ->> 'tenant_id')::uuid and t.org_id = v_unit.org_id;
    if v_tenant_id is null then
      perform app.raise_error('not_found', 'Tenant not found in this workspace.');
    end if;
  else
    if length(trim(coalesce(p ->> 'tenant_name', ''))) < 1 then
      perform app.raise_error('validation', 'Enter the tenant''s name.');
    end if;
    insert into public.tenants (org_id, full_name, phone, email, created_by)
    values (v_unit.org_id, trim(p ->> 'tenant_name'), nullif(trim(p ->> 'tenant_phone'), ''),
            nullif(lower(trim(p ->> 'tenant_email')), ''), auth.uid())
    returning id into v_tenant_id;
  end if;

  insert into public.tenancies (org_id, property_id, unit_id, tenant_id, start_date, due_day,
                                deposit_held, created_by)
  values (v_unit.org_id, v_unit.property_id, v_unit.id, v_tenant_id, v_start, v_due,
          nullif(p ->> 'deposit_held', '')::numeric, auth.uid())
  returning id into v_tenancy_id;

  insert into public.tenancy_rent_rates (tenancy_id, effective_from, amount, note, created_by)
  values (v_tenancy_id, v_start, v_rent, 'Starting rent', auth.uid());

  update public.units set occupancy = 'occupied', occupancy_date = v_start where id = v_unit.id;

  if v_opening > 0 then
    insert into public.rent_charges (org_id, property_id, unit_id, tenancy_id, category, period_start,
                                     due_date, amount, description, created_by)
    values (v_unit.org_id, v_unit.property_id, v_unit.id, v_tenancy_id, 'opening_balance',
            date_trunc('month', v_opening_date)::date, v_opening_date, v_opening,
            trim(p ->> 'opening_balance_note'), auth.uid());
  elsif v_opening < 0 then
    insert into public.payment_entries (org_id, property_id, unit_id, tenancy_id, kind, amount, paid_on,
      notes, status, recorded_by, confirmed_by, confirmed_at, decided_by, decided_at,
      confirm_acknowledged, client_request_id)
    values (v_unit.org_id, v_unit.property_id, v_unit.id, v_tenancy_id, 'opening_credit', -v_opening,
      v_opening_date, trim(p ->> 'opening_balance_note'), 'confirmed', auth.uid(), auth.uid(), now(),
      auth.uid(), now(), true, gen_random_uuid())
    returning id into v_entry_id;
    perform app.entry_event(v_entry_id, 'created', null, jsonb_build_object('kind', 'opening_credit'));
    perform app.entry_event(v_entry_id, 'confirmed', null, jsonb_build_object('kind', 'opening_credit'));
  end if;

  perform app.audit(v_unit.org_id, v_unit.property_id, 'tenancy_created', 'tenancy', v_tenancy_id::text,
    jsonb_build_object('unit', v_unit.label, 'rent', v_rent, 'start', v_start, 'opening_balance', v_opening));
  perform app.touch_membership(v_unit.org_id);
  return v_tenancy_id;
end $$;

-- Moving out closes the tenancy. Its arrears stay with it and never move to the next tenant.
create or replace function public.end_tenancy(
  p_tenancy uuid, p_end_date date, p_reason text, p_unit_occupancy text default 'vacant'
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.tenancies;
begin
  select * into v_t from public.tenancies where id = p_tenancy for update;
  if v_t.id is null then perform app.raise_error('not_found', 'Tenancy not found.'); end if;
  perform app.require(v_t.property_id, 'manage_tenancies');
  if v_t.status <> 'active' then perform app.raise_error('validation', 'This tenancy has already ended.'); end if;
  if p_end_date is null or p_end_date < v_t.start_date then
    perform app.raise_error('validation', 'The end date must be on or after the start date.');
  end if;
  if p_unit_occupancy not in ('vacant', 'reserved', 'unavailable') then
    perform app.raise_error('validation', 'Choose vacant, reserved or unavailable for the unit.');
  end if;

  update public.tenancies set status = 'ended', end_date = p_end_date, ended_reason = nullif(trim(p_reason), '')
  where id = p_tenancy;
  update public.units set occupancy = p_unit_occupancy, occupancy_date = p_end_date where id = v_t.unit_id;
  perform app.audit(v_t.org_id, v_t.property_id, 'tenancy_ended', 'tenancy', p_tenancy::text,
    jsonb_build_object('end_date', p_end_date, 'reason', p_reason));
end $$;

create or replace function public.change_rent(
  p_tenancy uuid, p_effective_from date, p_amount numeric, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.tenancies;
begin
  select * into v_t from public.tenancies where id = p_tenancy;
  if v_t.id is null then perform app.raise_error('not_found', 'Tenancy not found.'); end if;
  perform app.require(v_t.property_id, 'manage_tenancies');
  if p_effective_from is null or extract(day from p_effective_from) <> 1 then
    perform app.raise_error('validation', 'Rent changes apply from the first day of a rent period.');
  end if;
  if p_amount is null or p_amount <= 0 then
    perform app.raise_error('validation', 'Enter the new monthly rent in KSh.');
  end if;
  insert into public.tenancy_rent_rates (tenancy_id, effective_from, amount, note, created_by)
  values (p_tenancy, p_effective_from, p_amount, nullif(trim(p_note), ''), auth.uid())
  on conflict (tenancy_id, effective_from) do update set amount = excluded.amount, note = excluded.note;
  perform app.audit(v_t.org_id, v_t.property_id, 'rent_changed', 'tenancy', p_tenancy::text,
    jsonb_build_object('effective_from', p_effective_from, 'amount', p_amount));
end $$;

-- ---------------------------------------------------------------------------
-- Rent charges
-- ---------------------------------------------------------------------------

-- The rent each active tenancy owes for a period, using the rate effective on the period's
-- first day (or the tenancy start, if later).
create or replace function app.period_charges(p_property uuid, p_period date)
returns table (tenancy_id uuid, unit_id uuid, unit_label text, tenant_name text, amount numeric,
               due_date date, already_exists boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.unit_id, u.label, tn.full_name,
    (select r.amount from public.tenancy_rent_rates r
      where r.tenancy_id = t.id and r.effective_from <= greatest(p_period, t.start_date)
      order by r.effective_from desc limit 1),
    make_date(extract(year from p_period)::int, extract(month from p_period)::int, t.due_day),
    exists (select 1 from public.rent_charges c
            where c.tenancy_id = t.id and c.category = 'rent' and c.period_start = p_period)
  from public.tenancies t
  join public.units u on u.id = t.unit_id
  join public.tenants tn on tn.id = t.tenant_id
  where t.property_id = p_property
    and t.start_date <= (p_period + interval '1 month' - interval '1 day')::date
    and (t.end_date is null or t.end_date >= p_period)
  order by u.label
$$;

create or replace function public.preview_rent_charges(p_property uuid, p_period date)
returns table (tenancy_id uuid, unit_id uuid, unit_label text, tenant_name text, amount numeric,
               due_date date, already_exists boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require(p_property, 'view');
  if extract(day from p_period) <> 1 then
    perform app.raise_error('validation', 'Choose a rent period.');
  end if;
  return query select * from app.period_charges(p_property, p_period);
end $$;

create or replace function app.create_period_charges(p_property uuid, p_period date, p_actor uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  insert into public.rent_charges (org_id, property_id, unit_id, tenancy_id, category, period_start,
                                   due_date, amount, description, created_by)
  select p.org_id, p_property, pc.unit_id, pc.tenancy_id, 'rent', p_period, pc.due_date, pc.amount,
         app.period_label(p_period) || ' rent', p_actor
  from app.period_charges(p_property, p_period) pc
  join public.properties p on p.id = p_property
  where not pc.already_exists and pc.amount is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.generate_rent_charges(p_property uuid, p_period date) returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int; v_org uuid;
begin
  if not (app.can(p_property, 'manage_tenancies') or app.can(p_property, 'confirm')) then
    perform app.raise_error('forbidden', 'You do not have permission to create rent charges for this property.');
  end if;
  if extract(day from p_period) <> 1 then
    perform app.raise_error('validation', 'Choose a rent period.');
  end if;
  if p_period > (date_trunc('month', app.today()) + interval '1 month')::date then
    perform app.raise_error('validation', 'Charges can be created up to one period ahead.');
  end if;
  v_count := app.create_period_charges(p_property, p_period, auth.uid());
  select org_id into v_org from public.properties where id = p_property;
  perform app.audit(v_org, p_property, 'charges_generated', 'property', p_property::text,
    jsonb_build_object('period', p_period, 'created', v_count));
  perform app.touch_membership(v_org);
  return v_count;
end $$;

-- Scheduled job: create the current period's charges for properties that turned on
-- recurring charges. Idempotent; safe to run daily.
create or replace function app.generate_due_charges() returns int
language plpgsql security definer set search_path = '' as $$
declare v_p record; v_total int := 0;
begin
  for v_p in select id from public.properties where auto_charges and archived_at is null loop
    v_total := v_total + app.create_period_charges(v_p.id, date_trunc('month', app.today())::date, null);
  end loop;
  return v_total;
end $$;
revoke execute on function app.generate_due_charges() from anon, authenticated;

-- Waive, prorate or void part of a charge: an explicit decision with a reason.
create or replace function public.adjust_charge(p_charge uuid, p_reduce_by numeric, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_c public.rent_charges; v_net numeric; v_alloc numeric;
begin
  select * into v_c from public.rent_charges where id = p_charge for update;
  if v_c.id is null then perform app.raise_error('not_found', 'Charge not found.'); end if;
  perform app.require(v_c.property_id, 'correct');
  if p_reduce_by is null or p_reduce_by <= 0 then
    perform app.raise_error('validation', 'Enter the amount to reduce this charge by.');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    perform app.raise_error('validation', 'Give a reason for the adjustment.');
  end if;
  v_net := app.charge_net(p_charge);
  v_alloc := app.charge_allocated(p_charge);
  if v_net - p_reduce_by < v_alloc then
    perform app.raise_error('validation',
      'Confirmed payments already cover more than the adjusted amount. Correct those entries first.');
  end if;
  insert into public.charge_adjustments (org_id, property_id, charge_id, amount, reason, created_by)
  values (v_c.org_id, v_c.property_id, p_charge, -p_reduce_by, trim(p_reason), auth.uid());
  perform app.audit(v_c.org_id, v_c.property_id, 'charge_adjusted', 'rent_charge', p_charge::text,
    jsonb_build_object('reduce_by', p_reduce_by, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Payment entries
-- ---------------------------------------------------------------------------

-- Create or edit an entry, then save it as a draft, submit it for confirmation, or (for an
-- authorised manager) confirm it in the same action.
-- p: {client_request_id, entry_id?, expected_version?, tenancy_id, amount, paid_on, method,
--     reference, notes, allocations:[{charge_id, amount}], action: draft|submit|confirm,
--     acknowledged}
create or replace function public.save_payment_entry(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid := (p ->> 'client_request_id')::uuid;
  v_action text := coalesce(p ->> 'action', 'draft');
  v_entry public.payment_entries;
  v_tenancy public.tenancies;
  v_amount numeric := (p ->> 'amount')::numeric;
  v_paid_on date := (p ->> 'paid_on')::date;
  v_allocs jsonb;
  v_method text := nullif(p ->> 'method', '');
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  if v_request is null then perform app.raise_error('validation', 'Missing request identifier.'); end if;
  if v_action not in ('draft', 'submit', 'confirm') then
    perform app.raise_error('validation', 'Unknown action.');
  end if;

  -- Retry safety: a repeated request returns the original outcome instead of posting again.
  if nullif(p ->> 'entry_id', '') is null then
    select * into v_entry from public.payment_entries where client_request_id = v_request;
    if v_entry.id is not null then
      if not app.can(v_entry.property_id, 'view') then
        perform app.raise_error('forbidden', 'You do not have access to this entry.');
      end if;
      return jsonb_build_object('id', v_entry.id, 'ref', v_entry.ref, 'status', v_entry.status,
                                'version', v_entry.version, 'replayed', true);
    end if;
  end if;

  select * into v_tenancy from public.tenancies where id = (p ->> 'tenancy_id')::uuid;
  if v_tenancy.id is null then perform app.raise_error('not_found', 'Tenancy not found.'); end if;
  perform app.require(v_tenancy.property_id, 'enter_payments');
  if v_action = 'confirm' then
    perform app.require(v_tenancy.property_id, 'confirm');
    if coalesce((p ->> 'acknowledged')::boolean, false) is not true then
      perform app.raise_error('acknowledgement_required',
        'Tick the box to confirm you checked this payment using your property''s external records.');
    end if;
  end if;

  if v_amount is null or v_amount <= 0 or round(v_amount, 2) <> v_amount then
    perform app.raise_error('validation', 'Enter the amount paid in KSh.');
  end if;
  if v_paid_on is null then perform app.raise_error('validation', 'Enter the date the tenant paid.'); end if;
  if v_paid_on > app.today() then
    perform app.raise_error('validation', 'The payment date cannot be in the future.');
  end if;
  if v_paid_on < date '2000-01-01' then
    perform app.raise_error('validation', 'Check the payment date.');
  end if;
  if v_method is not null and v_method not in ('mpesa', 'bank', 'cash', 'other') then
    perform app.raise_error('validation', 'Choose how they paid, or leave it blank.');
  end if;

  v_allocs := app.validate_allocations(v_tenancy.id, v_amount, coalesce(p -> 'allocations', '[]'::jsonb), false);

  if nullif(p ->> 'entry_id', '') is null then
    insert into public.payment_entries (org_id, property_id, unit_id, tenancy_id, amount, paid_on, method,
      reference, notes, proposed_allocations, status, recorded_by, assigned_to, client_request_id)
    values (v_tenancy.org_id, v_tenancy.property_id, v_tenancy.unit_id, v_tenancy.id, v_amount, v_paid_on,
      v_method, nullif(trim(p ->> 'reference'), ''), nullif(trim(p ->> 'notes'), ''), v_allocs, 'draft',
      auth.uid(), auth.uid(), v_request)
    returning * into v_entry;
    perform app.entry_event(v_entry.id, 'created');
  else
    select * into v_entry from public.payment_entries where id = (p ->> 'entry_id')::uuid for update;
    if v_entry.id is null or v_entry.tenancy_id <> v_tenancy.id then
      perform app.raise_error('not_found', 'Entry not found.');
    end if;
    if v_entry.status not in ('draft', 'returned') then
      perform app.raise_error('not_editable', 'Only drafts and returned entries can be edited.');
    end if;
    if auth.uid() not in (v_entry.recorded_by, coalesce(v_entry.assigned_to, v_entry.recorded_by))
       and not app.is_org_admin(v_entry.org_id) then
      perform app.raise_error('forbidden', 'Only the person who recorded this entry can edit it.');
    end if;
    if (p ->> 'expected_version')::int is distinct from v_entry.version then
      perform app.raise_error('stale', 'This entry changed since you opened it. Reload to see the latest version.');
    end if;
    update public.payment_entries set amount = v_amount, paid_on = v_paid_on, method = v_method,
      reference = nullif(trim(p ->> 'reference'), ''), notes = nullif(trim(p ->> 'notes'), ''),
      proposed_allocations = v_allocs, status = 'draft', version = version + 1
    where id = v_entry.id
    returning * into v_entry;
    perform app.entry_event(v_entry.id, 'edited');
  end if;

  if v_action = 'submit' then
    update public.payment_entries set status = 'awaiting_confirmation', submitted_by = auth.uid(),
      submitted_at = now(), decision_reason = null, version = version + 1
    where id = v_entry.id returning * into v_entry;
    perform app.entry_event(v_entry.id, 'submitted');
    perform app.notify_confirmers(v_entry.id);
  elsif v_action = 'confirm' then
    perform app.post_confirmation(v_entry.id);
  end if;

  perform app.touch_membership(v_entry.org_id);
  select * into v_entry from public.payment_entries where id = v_entry.id;
  return jsonb_build_object('id', v_entry.id, 'ref', v_entry.ref, 'status', v_entry.status,
                            'version', v_entry.version, 'replayed', false);
end $$;

-- Confirm, return for changes, or do not accept a submitted entry. Only the first valid
-- confirmation posts; a second reviewer sees who already decided.
create or replace function public.decide_entry(
  p_entry uuid, p_decision text, p_reason text default null, p_acknowledged boolean default false,
  p_expected_version int default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.payment_entries;
  v_who text;
  v_result jsonb;
begin
  select * into v_entry from public.payment_entries where id = p_entry for update;
  if v_entry.id is null then perform app.raise_error('not_found', 'Entry not found.'); end if;
  perform app.require(v_entry.property_id, 'confirm');
  if p_decision not in ('confirm', 'return', 'not_accept') then
    perform app.raise_error('validation', 'Unknown decision.');
  end if;

  if v_entry.status in ('confirmed', 'returned', 'not_accepted', 'reversed') then
    if p_decision = 'confirm' and v_entry.status = 'confirmed' and v_entry.confirmed_by = auth.uid() then
      return jsonb_build_object('id', v_entry.id, 'ref', v_entry.ref, 'status', v_entry.status, 'replayed', true);
    end if;
    select coalesce(nullif(pr.full_name, ''), 'another manager') into v_who
    from public.profiles pr where pr.id = v_entry.decided_by;
    perform app.raise_error('already_decided', format('This entry was already %s by %s on %s.',
      replace(v_entry.status, '_', ' '), coalesce(v_who, 'another manager'),
      to_char(v_entry.decided_at at time zone 'Africa/Nairobi', 'DD Mon YYYY, HH24:MI')));
  end if;
  if v_entry.status = 'draft' and not (p_decision = 'confirm' and v_entry.recorded_by = auth.uid()) then
    perform app.raise_error('not_submitted', 'This entry has not been submitted yet.');
  end if;
  if p_expected_version is not null and p_expected_version <> v_entry.version then
    perform app.raise_error('stale', 'This entry changed since you opened it. Reload to review the latest version.');
  end if;

  if p_decision = 'confirm' then
    if p_acknowledged is not true then
      perform app.raise_error('acknowledgement_required',
        'Tick the box to confirm you checked this payment using your property''s external records.');
    end if;
    v_result := app.post_confirmation(p_entry);
  else
    if length(trim(coalesce(p_reason, ''))) < 3 then
      perform app.raise_error('reason_required', 'Explain what needs to change, so the person who entered it can fix it.');
    end if;
    update public.payment_entries set
      status = case when p_decision = 'return' then 'returned' else 'not_accepted' end,
      decided_by = auth.uid(), decided_at = now(), decision_reason = trim(p_reason),
      assigned_to = case when p_decision = 'return' then coalesce(submitted_by, recorded_by) else null end,
      version = version + 1
    where id = p_entry;
    perform app.entry_event(p_entry, case when p_decision = 'return' then 'returned' else 'not_accepted' end,
      trim(p_reason));
    perform app.notify(coalesce(v_entry.submitted_by, v_entry.recorded_by), v_entry.org_id,
      'entry_' || p_decision || ':' || v_entry.id || ':' || v_entry.version, 'entry_' || p_decision,
      case when p_decision = 'return' then 'Entry returned for changes' else 'Entry not accepted' end,
      v_entry.ref || ': "' || trim(p_reason) || '"',
      '/w/' || v_entry.org_id || '/rent/' || v_entry.property_id || '/entries/' || v_entry.id);
    v_result := jsonb_build_object('id', v_entry.id, 'ref', v_entry.ref,
      'status', case when p_decision = 'return' then 'returned' else 'not_accepted' end);
  end if;

  perform app.touch_membership(v_entry.org_id);
  return v_result;
end $$;

-- Bulk confirmation of entries the reviewer has checked externally. Each entry succeeds or
-- fails on its own; a retry never duplicates entries already confirmed.
create or replace function public.confirm_entries(p_entries uuid[], p_acknowledged boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  if p_acknowledged is not true then
    perform app.raise_error('acknowledgement_required',
      'Tick the box to confirm you checked these payments using your property''s external records.');
  end if;
  if coalesce(array_length(p_entries, 1), 0) > 50 then
    perform app.raise_error('validation', 'Confirm up to 50 entries at a time.');
  end if;
  foreach v_id in array p_entries loop
    begin
      v_res := public.decide_entry(v_id, 'confirm', null, true, null);
      v_results := v_results || jsonb_build_array(v_res || jsonb_build_object('ok', true));
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false,
        'error', sqlerrm));
    end;
  end loop;
  return v_results;
end $$;

-- Reverse a confirmed entry: post negative allocations linked to the originals. History
-- and the original entry remain.
create or replace function app.reverse_entry_internal(p_entry uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_entry public.payment_entries; v_a record;
begin
  select * into v_entry from public.payment_entries where id = p_entry for update;
  if v_entry.id is null then perform app.raise_error('not_found', 'Entry not found.'); end if;
  perform app.require(v_entry.property_id, 'correct');
  if v_entry.status <> 'confirmed' then
    perform app.raise_error('not_confirmed', 'Only confirmed entries can be reversed.');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    perform app.raise_error('reason_required', 'Give a reason for the correction.');
  end if;

  for v_a in
    select a.* from public.allocations a
    where a.entry_id = p_entry and a.amount > 0
      and not exists (select 1 from public.allocations r where r.reverses_allocation_id = a.id)
    for update
  loop
    insert into public.allocations (org_id, property_id, tenancy_id, entry_id, charge_id, amount,
                                    reverses_allocation_id, posted_by)
    values (v_a.org_id, v_a.property_id, v_a.tenancy_id, v_a.entry_id, v_a.charge_id, -v_a.amount,
            v_a.id, auth.uid());
  end loop;

  update public.payment_entries set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(),
    reversal_reason = trim(p_reason), version = version + 1
  where id = p_entry;
  perform app.entry_event(p_entry, 'reversed', trim(p_reason));
  perform app.audit(v_entry.org_id, v_entry.property_id, 'entry_reversed', 'payment_entry', p_entry::text,
    jsonb_build_object('ref', v_entry.ref, 'amount', v_entry.amount, 'reason', trim(p_reason)));
end $$;

create or replace function public.reverse_entry(p_entry uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_entry public.payment_entries;
begin
  perform app.reverse_entry_internal(p_entry, p_reason);
  select * into v_entry from public.payment_entries where id = p_entry;
  perform app.touch_membership(v_entry.org_id);
  return jsonb_build_object('id', v_entry.id, 'ref', v_entry.ref, 'status', v_entry.status);
end $$;

-- Correct a confirmed entry: reverse it and post a linked replacement in one transaction.
-- The replacement is confirmed directly when the corrector may confirm; otherwise it waits
-- for confirmation like any other submission.
create or replace function public.correct_entry(p_entry uuid, p_reason text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.payment_entries;
  v_res jsonb;
  v_can_confirm boolean;
begin
  select * into v_old from public.payment_entries where id = p_entry;
  if v_old.id is null then perform app.raise_error('not_found', 'Entry not found.'); end if;

  -- Retry safety for the replacement.
  if exists (select 1 from public.payment_entries where client_request_id = (p ->> 'client_request_id')::uuid) then
    return public.save_payment_entry(p);
  end if;

  perform app.reverse_entry_internal(p_entry, p_reason);
  v_can_confirm := app.can(v_old.property_id, 'confirm');
  v_res := public.save_payment_entry(
    (p - 'entry_id' - 'expected_version')
    || jsonb_build_object('tenancy_id', v_old.tenancy_id,
                          'action', case when v_can_confirm then 'confirm' else 'submit' end,
                          'acknowledged', coalesce((p ->> 'acknowledged')::boolean, false)));
  update public.payment_entries set replaces_entry_id = p_entry where id = (v_res ->> 'id')::uuid;
  perform app.entry_event(p_entry, 'replaced', trim(p_reason), jsonb_build_object('replacement', v_res ->> 'id'));
  return v_res;
end $$;

-- Apply part of a confirmed entry's unallocated remainder (tenant credit) to charges.
create or replace function public.apply_credit(p_entry uuid, p_allocations jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.payment_entries;
  v_allocs jsonb;
  v_line record;
  v_total numeric := 0;
begin
  select * into v_entry from public.payment_entries where id = p_entry for update;
  if v_entry.id is null then perform app.raise_error('not_found', 'Entry not found.'); end if;
  perform app.require(v_entry.property_id, 'confirm');
  if v_entry.status <> 'confirmed' then
    perform app.raise_error('not_confirmed', 'Credit can only come from a confirmed entry.');
  end if;
  v_allocs := app.validate_allocations(v_entry.tenancy_id, app.entry_unallocated(p_entry), p_allocations, true);
  for v_line in select (x ->> 'charge_id')::uuid as charge_id, (x ->> 'amount')::numeric as amount
                from jsonb_array_elements(v_allocs) x loop
    insert into public.allocations (org_id, property_id, tenancy_id, entry_id, charge_id, amount, posted_by)
    values (v_entry.org_id, v_entry.property_id, v_entry.tenancy_id, p_entry, v_line.charge_id,
            v_line.amount, auth.uid());
    v_total := v_total + v_line.amount;
  end loop;
  if v_total = 0 then perform app.raise_error('validation', 'Enter an amount to apply.'); end if;
  perform app.entry_event(p_entry, 'credit_applied', null, jsonb_build_object('allocations', v_allocs));
  return jsonb_build_object('id', p_entry, 'applied', v_total, 'credit', app.entry_unallocated(p_entry));
end $$;

-- Warn about likely duplicates before saving. Not a block: legitimate similar payments exist.
create or replace function public.possible_duplicates(
  p_tenancy uuid, p_amount numeric, p_paid_on date, p_reference text, p_exclude uuid default null
) returns table (id uuid, ref text, amount numeric, paid_on date, reference text, status text, reason text)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.ref, e.amount, e.paid_on, e.reference, e.status,
    case when p_reference is not null and length(trim(p_reference)) > 0
              and lower(e.reference) = lower(trim(p_reference)) then 'same_reference'
         else 'same_amount_and_date' end
  from public.payment_entries e
  where e.status not in ('reversed', 'not_accepted')
    and (p_exclude is null or e.id <> p_exclude)
    and (
      (p_reference is not null and length(trim(p_reference)) > 0
        and lower(e.reference) = lower(trim(p_reference))
        and e.property_id = (select t.property_id from public.tenancies t where t.id = p_tenancy))
      or (e.tenancy_id = p_tenancy and e.amount = p_amount and abs(e.paid_on - p_paid_on) <= 3)
    )
  limit 5
$$;

-- ---------------------------------------------------------------------------
-- Attachments (files live in the private `private-docs` storage bucket)
-- ---------------------------------------------------------------------------

create or replace function public.register_attachment(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.payment_entries;
  v_path text := p ->> 'storage_path';
  v_id uuid;
begin
  select * into v_entry from public.payment_entries where id = (p ->> 'entry_id')::uuid;
  if v_entry.id is null then perform app.raise_error('not_found', 'Entry not found.'); end if;
  perform app.require(v_entry.property_id, 'enter_payments');
  if v_entry.status not in ('draft', 'returned', 'awaiting_confirmation') then
    perform app.raise_error('not_editable', 'Evidence can only be added before an entry is confirmed.');
  end if;
  if v_path is null or v_path not like (v_entry.org_id || '/' || v_entry.property_id || '/%') then
    perform app.raise_error('validation', 'Upload the file to this property''s private folder.');
  end if;
  if (p ->> 'mime_type') not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf') then
    perform app.raise_error('validation', 'Upload a JPG, PNG, WEBP, HEIC or PDF file.');
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'private-docs' and o.name = v_path) then
    perform app.raise_error('validation', 'The upload did not finish. Try again.');
  end if;
  insert into public.attachments (org_id, property_id, entry_id, kind, storage_path, file_name, mime_type,
                                  size_bytes, uploaded_by)
  values (v_entry.org_id, v_entry.property_id, v_entry.id, 'payment_evidence', v_path,
          left(coalesce(p ->> 'file_name', 'evidence'), 200), p ->> 'mime_type', (p ->> 'size_bytes')::int,
          auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.remove_attachment(p_attachment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_a public.attachments; v_status text;
begin
  select * into v_a from public.attachments where id = p_attachment;
  if v_a.id is null then perform app.raise_error('not_found', 'File not found.'); end if;
  select status into v_status from public.payment_entries where id = v_a.entry_id;
  if v_a.uploaded_by <> auth.uid() or v_status not in ('draft', 'returned', 'awaiting_confirmation') then
    perform app.raise_error('forbidden', 'This file can no longer be removed.');
  end if;
  update public.attachments set removed_at = now(), removed_by = auth.uid() where id = p_attachment;
end $$;

-- ---------------------------------------------------------------------------
-- Read models. SECURITY INVOKER: row-level security limits every row to what the caller
-- may see. These are the single definitions of each metric used by the register, the
-- dashboard and reports.
-- ---------------------------------------------------------------------------

create or replace function public.rent_register(p_property uuid, p_period date, p_cutoff timestamptz default null)
returns table (
  unit_id uuid, unit_label text, occupancy text, layout text,
  tenancy_id uuid, tenancy_status text, tenant_name text,
  billed numeric, confirmed numeric, outstanding numeric, due_date date,
  rent_status text, overdue boolean,
  pending_count int, pending_amount numeric, pending_by text,
  credit numeric, last_confirmed_at timestamptz, last_confirmed_by text, charge_ids uuid[]
)
language sql stable security invoker set search_path = '' as $$
  with cut as (select coalesce(p_cutoff, now()) as at,
                      least(app.today(), coalesce(p_cutoff, now())::date) as day),
  ten as (
    select t.* from public.tenancies t
    where t.property_id = p_property
      and t.start_date <= (p_period + interval '1 month' - interval '1 day')::date
      and (t.end_date is null or t.end_date >= p_period)
  ),
  ch as (
    select c.tenancy_id, c.id, c.due_date,
      c.amount + coalesce((select sum(a.amount) from public.charge_adjustments a
                           where a.charge_id = c.id and a.created_at <= (select at from cut)), 0) as net,
      coalesce((select sum(x.amount) from public.allocations x
                where x.charge_id = c.id and x.posted_at <= (select at from cut)), 0) as alloc
    from public.rent_charges c
    where c.property_id = p_property and c.category = 'rent' and c.period_start = p_period
      and c.created_at <= (select at from cut)
  ),
  per_ten as (
    select t.id as tenancy_id, t.unit_id, t.status,
      coalesce(sum(ch.net), 0) as billed, coalesce(sum(ch.alloc), 0) as confirmed,
      min(ch.due_date) as due_date, array_remove(array_agg(ch.id), null) as charge_ids
    from ten t left join ch on ch.tenancy_id = t.id
    group by t.id, t.unit_id, t.status
  ),
  rows as (
    select u.id as unit_id, u.label, u.occupancy, u.layout, pt.tenancy_id, pt.status as tenancy_status,
      pt.billed, pt.confirmed, pt.due_date, pt.charge_ids
    from public.units u left join per_ten pt on pt.unit_id = u.id
    where u.property_id = p_property
  )
  select r.unit_id, r.label, r.occupancy, r.layout, r.tenancy_id, r.tenancy_status, tn.full_name,
    coalesce(r.billed, 0), coalesce(r.confirmed, 0), coalesce(r.billed, 0) - coalesce(r.confirmed, 0),
    r.due_date,
    case
      when r.tenancy_id is null then case when r.occupancy = 'unavailable' then 'unavailable' else 'vacant' end
      when coalesce(r.billed, 0) = 0 then 'no_charge'
      when r.billed - r.confirmed <= 0 and coalesce(cr.credit, 0) > 0 then 'credit'
      when r.billed - r.confirmed <= 0 then 'paid'
      when r.confirmed > 0 then 'partial'
      when r.due_date > (select day from cut) then 'not_yet_due'
      else 'unpaid'
    end,
    coalesce(r.billed - r.confirmed > 0 and r.due_date < (select day from cut), false),
    coalesce(pe.cnt, 0)::int, coalesce(pe.total, 0), pe.by_name,
    coalesce(cr.credit, 0), lc.confirmed_at, lc.by_name, coalesce(r.charge_ids, '{}')
  from rows r
  left join public.tenancies t on t.id = r.tenancy_id
  left join public.tenants tn on tn.id = t.tenant_id
  left join lateral (
    select count(*) as cnt, sum(e.amount) as total,
      (select coalesce(nullif(p.full_name, ''), 'staff') from public.profiles p
        where p.id = (array_agg(e.submitted_by order by e.submitted_at desc))[1]) as by_name
    from public.payment_entries e
    where e.tenancy_id = r.tenancy_id and e.status = 'awaiting_confirmation'
  ) pe on true
  left join lateral (
    select sum(e.amount - coalesce((select sum(x.amount) from public.allocations x
                                    where x.entry_id = e.id and x.posted_at <= (select at from cut)), 0)) as credit
    from public.payment_entries e
    where e.tenancy_id = r.tenancy_id and e.status = 'confirmed' and e.confirmed_at <= (select at from cut)
  ) cr on true
  left join lateral (
    select e.confirmed_at, coalesce(nullif(p.full_name, ''), 'staff') as by_name
    from public.allocations x join public.payment_entries e on e.id = x.entry_id
    left join public.profiles p on p.id = e.confirmed_by
    where x.charge_id = any (r.charge_ids) and x.amount > 0
    order by e.confirmed_at desc limit 1
  ) lc on true
  order by r.label, r.tenancy_status nulls first
$$;

-- Property or portfolio summary for one rent period, at a cut-off time.
create or replace function public.rent_summary(
  p_org uuid, p_property uuid, p_period date, p_cutoff timestamptz default null
) returns table (
  billed numeric, settled numeric, collection_rate numeric, outstanding numeric, overdue numeric,
  pending_count int, pending_amount numeric, occupied int, lettable int, unavailable int,
  units_total int, computed_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  with cut as (select coalesce(p_cutoff, now()) as at,
                      least(app.today(), coalesce(p_cutoff, now())::date) as day),
  props as (
    select p.id from public.properties p
    where p.org_id = p_org and (p_property is null or p.id = p_property) and p.archived_at is null
  ),
  ch as (
    select c.id, c.due_date,
      c.amount + coalesce((select sum(a.amount) from public.charge_adjustments a
                           where a.charge_id = c.id and a.created_at <= (select at from cut)), 0) as net,
      coalesce((select sum(x.amount) from public.allocations x
                where x.charge_id = c.id and x.posted_at <= (select at from cut)), 0) as alloc
    from public.rent_charges c
    where c.property_id in (select id from props) and c.category = 'rent' and c.period_start = p_period
      and c.created_at <= (select at from cut)
  ),
  u as (select * from public.units where property_id in (select id from props))
  select
    coalesce(sum(ch.net), 0),
    coalesce(sum(ch.alloc), 0),
    case when coalesce(sum(ch.net), 0) = 0 then null
         else round(coalesce(sum(ch.alloc), 0) / sum(ch.net) * 100, 1) end,
    coalesce(sum(ch.net - ch.alloc), 0),
    coalesce(sum(ch.net - ch.alloc) filter (where ch.due_date < (select day from cut)), 0),
    (select count(*)::int from public.payment_entries e
      where e.property_id in (select id from props) and e.status = 'awaiting_confirmation'),
    (select coalesce(sum(e.amount), 0) from public.payment_entries e
      where e.property_id in (select id from props) and e.status = 'awaiting_confirmation'),
    (select count(*)::int from u where occupancy in ('occupied', 'notice_given')),
    (select count(*)::int from u where occupancy <> 'unavailable'),
    (select count(*)::int from u where occupancy = 'unavailable'),
    (select count(*)::int from u),
    now()
  from ch
$$;

create or replace function public.rent_trend(p_org uuid, p_property uuid, p_last_period date, p_months int default 6)
returns table (period_start date, billed numeric, settled numeric, collection_rate numeric)
language sql stable security invoker set search_path = '' as $$
  select g.period::date, s.billed, s.settled, s.collection_rate
  from generate_series(p_last_period - make_interval(months => greatest(least(p_months, 24), 1) - 1),
                       p_last_period, interval '1 month') g(period)
  cross join lateral public.rent_summary(p_org, p_property, g.period::date, null) s
  order by 1
$$;

create or replace function public.arrears_ageing(p_org uuid, p_property uuid)
returns table (bucket text, units int, amount numeric)
language sql stable security invoker set search_path = '' as $$
  with ch as (
    select c.tenancy_id, c.unit_id, c.due_date, t.status as tenancy_status,
      c.amount + coalesce((select sum(a.amount) from public.charge_adjustments a where a.charge_id = c.id), 0)
      - coalesce((select sum(x.amount) from public.allocations x where x.charge_id = c.id), 0) as outstanding
    from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
    join public.properties p on p.id = c.property_id
    where p.org_id = p_org and (p_property is null or c.property_id = p_property)
      and c.category in ('rent', 'opening_balance') and c.due_date < app.today()
  ),
  b as (
    select case when tenancy_status = 'ended' then 'former'
                when app.today() - due_date <= 30 then '0_30'
                when app.today() - due_date <= 60 then '31_60'
                else '61_plus' end as bucket, unit_id, tenancy_id, outstanding
    from ch where outstanding > 0
  )
  select k.bucket,
    (select count(distinct case when k.bucket = 'former' then b.tenancy_id else b.unit_id end)::int
       from b where b.bucket = k.bucket),
    (select coalesce(sum(b.outstanding), 0) from b where b.bucket = k.bucket)
  from (values ('0_30', 1), ('31_60', 2), ('61_plus', 3), ('former', 4)) k(bucket, ord)
  order by k.ord
$$;

-- "By payment date": confirmed payments dated within a calendar month. Kept separate from
-- rent-period settlement and never silently mixed with it.
create or replace function public.payments_by_date(p_org uuid, p_property uuid, p_month date)
returns table (entry_id uuid, ref text, property_id uuid, unit_label text, tenant_name text, amount numeric,
               paid_on date, method text, reference text, recorded_by text, recorded_at timestamptz,
               confirmed_by text, confirmed_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.ref, e.property_id, u.label, tn.full_name, e.amount, e.paid_on, e.method, e.reference,
    coalesce(nullif(rp.full_name, ''), 'staff'), e.recorded_at,
    coalesce(nullif(cp.full_name, ''), 'staff'), e.confirmed_at
  from public.payment_entries e
  join public.properties p on p.id = e.property_id
  join public.units u on u.id = e.unit_id
  join public.tenancies t on t.id = e.tenancy_id
  join public.tenants tn on tn.id = t.tenant_id
  left join public.profiles rp on rp.id = e.recorded_by
  left join public.profiles cp on cp.id = e.confirmed_by
  where p.org_id = p_org and (p_property is null or e.property_id = p_property)
    and e.status = 'confirmed' and e.kind = 'payment'
    and e.paid_on >= p_month and e.paid_on < (p_month + interval '1 month')::date
  order by e.paid_on, u.label
$$;

create or replace function public.staff_activity(p_org uuid, p_property uuid, p_month date)
returns table (actor_id uuid, actor_name text, created int, submitted int, confirmed int, returned int,
               not_accepted int, reversed int)
language sql stable security invoker set search_path = '' as $$
  select ev.actor_id, coalesce(nullif(p.full_name, ''), 'staff'),
    count(*) filter (where ev.action = 'created')::int,
    count(*) filter (where ev.action = 'submitted')::int,
    count(*) filter (where ev.action = 'confirmed')::int,
    count(*) filter (where ev.action = 'returned')::int,
    count(*) filter (where ev.action = 'not_accepted')::int,
    count(*) filter (where ev.action = 'reversed')::int
  from public.entry_events ev
  join public.properties pr on pr.id = ev.property_id
  left join public.profiles p on p.id = ev.actor_id
  where pr.org_id = p_org and (p_property is null or ev.property_id = p_property)
    and ev.created_at >= (p_month::timestamp at time zone 'Africa/Nairobi')
    and ev.created_at < ((p_month + interval '1 month')::timestamp at time zone 'Africa/Nairobi')
  group by ev.actor_id, p.full_name
  order by 2
$$;

-- Tenant statement: opening balance, dated charges, adjustments, confirmed payments and
-- reversals, with a running balance (positive = owed, negative = credit).
create or replace function public.tenancy_statement(p_tenancy uuid)
returns table (line_date date, kind text, description text, charge numeric, payment numeric,
               balance numeric, ref text)
language sql stable security invoker set search_path = '' as $$
  with lines as (
    select c.due_date as d, 1 as ord, c.category as kind,
      case when c.category = 'rent' then app.period_label(c.period_start) || ' rent'
           when c.category = 'opening_balance' then 'Opening balance: ' || coalesce(c.description, '')
           else coalesce(c.description, 'Charge') end as description,
      c.amount as charge, 0::numeric as payment, null::text as ref, c.created_at as ts
    from public.rent_charges c where c.tenancy_id = p_tenancy
    union all
    select (a.created_at at time zone 'Africa/Nairobi')::date, 2, 'adjustment', 'Adjustment: ' || a.reason,
      a.amount, 0, null, a.created_at
    from public.charge_adjustments a join public.rent_charges c on c.id = a.charge_id
    where c.tenancy_id = p_tenancy
    union all
    select e.paid_on, 3, e.kind,
      case when e.kind = 'opening_credit' then 'Opening credit: ' || coalesce(e.notes, '')
           else 'Payment confirmed' || coalesce(' · ' || e.reference, '') end,
      0, e.amount, e.ref, e.confirmed_at
    from public.payment_entries e
    where e.tenancy_id = p_tenancy and e.status in ('confirmed', 'reversed') and e.confirmed_at is not null
    union all
    select (e.reversed_at at time zone 'Africa/Nairobi')::date, 4, 'reversal',
      'Reversal of ' || e.ref || ': ' || e.reversal_reason, 0, -e.amount, e.ref, e.reversed_at
    from public.payment_entries e where e.tenancy_id = p_tenancy and e.status = 'reversed'
  )
  select d, kind, description, charge, payment,
    sum(charge - payment) over (order by d, ord, ts rows unbounded preceding), ref
  from lines order by d, ord, ts
$$;

-- ---------------------------------------------------------------------------
-- Monthly report: built from the same functions; finalized versions are immutable.
-- ---------------------------------------------------------------------------

create or replace function public.build_report(p_property uuid, p_period date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'basis', 'Confirmed by property staff. Pending entries are not counted.',
    'period_start', p_period,
    'generated_at', now(),
    'property', (select jsonb_build_object('id', p.id, 'name', p.name, 'area', p.area)
                 from public.properties p where p.id = p_property),
    'summary', (select to_jsonb(s) from public.rent_summary(
                  (select org_id from public.properties where id = p_property), p_property, p_period, null) s),
    'register', (select coalesce(jsonb_agg(to_jsonb(r) - 'charge_ids'), '[]'::jsonb)
                 from public.rent_register(p_property, p_period, null) r),
    'arrears', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                from public.arrears_ageing((select org_id from public.properties where id = p_property), p_property) a),
    'payments', (select coalesce(jsonb_agg(to_jsonb(x) - 'property_id' - 'entry_id'), '[]'::jsonb)
                 from public.payments_by_date((select org_id from public.properties where id = p_property),
                                              p_property, p_period) x),
    'staff', (select coalesce(jsonb_agg(to_jsonb(s) - 'actor_id'), '[]'::jsonb)
              from public.staff_activity((select org_id from public.properties where id = p_property),
                                         p_property, p_period) s)
  )
$$;

create or replace function public.finalize_report(
  p_property uuid, p_period date, p_notes text, p_change_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_version int; v_org uuid; v_id uuid; v_snapshot jsonb;
begin
  if not (app.can(p_property, 'confirm') or app.can(p_property, 'export')) then
    perform app.raise_error('forbidden', 'You do not have permission to finalize reports for this property.');
  end if;
  select org_id into v_org from public.properties where id = p_property;
  select coalesce(max(version), 0) + 1 into v_version from public.report_versions
  where property_id = p_property and period_start = p_period;
  if v_version > 1 and length(trim(coalesce(p_change_note, ''))) < 3 then
    perform app.raise_error('validation', 'Explain what changed since the previous version.');
  end if;
  v_snapshot := public.build_report(p_property, p_period);
  insert into public.report_versions (org_id, property_id, period_start, version, snapshot, notes,
                                      change_note, prepared_by)
  values (v_org, p_property, p_period, v_version, v_snapshot, nullif(trim(p_notes), ''),
          nullif(trim(p_change_note), ''), auth.uid())
  returning id into v_id;
  perform app.audit(v_org, p_property, 'report_finalized', 'report_version', v_id::text,
    jsonb_build_object('period', p_period, 'version', v_version));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;

create or replace function public.log_export(p_org uuid, p_property uuid, p_kind text, p_period date)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_property is not null then
    perform app.require(p_property, 'export');
  elsif not app.is_org_admin(p_org) then
    perform app.raise_error('forbidden', 'You do not have permission to export these records.');
  end if;
  perform app.audit(p_org, p_property, 'export', p_kind, null, jsonb_build_object('period', p_period));
end $$;

revoke execute on all functions in schema public from anon;
