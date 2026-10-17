-- Rent records: tenants, tenancies, rent charges, manual payment entries, the allocation
-- ledger, attachments and finalized report versions.
--
-- Rules this schema protects
--  * Tenants pay outside the platform. Staff record what they checked externally.
--  * Only CONFIRMED entries post allocations. Balances, dashboards and reports are computed
--    from charges + posted allocations, never from editable totals.
--  * Allocations are append-only. A reversal posts negative allocation rows linked to the
--    originals; confirmed records are never deleted.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  phone text,
  email text,
  -- Optional login for a tenant self-view; not required to keep records.
  user_id uuid references public.profiles (id),
  notes text check (length(notes) <= 2000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenants_org_idx on public.tenants (org_id);
create trigger tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  unit_id uuid not null references public.units (id),
  tenant_id uuid not null references public.tenants (id),
  status text not null default 'active' check (status in ('active', 'ended')),
  start_date date not null,
  end_date date,
  due_day int not null check (due_day between 1 and 28),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly')),
  deposit_held numeric(12, 2) check (deposit_held >= 0),
  ended_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (status = 'active' or end_date is not null)
);
create unique index tenancies_one_active_per_unit on public.tenancies (unit_id) where status = 'active';
create index tenancies_property_idx on public.tenancies (property_id);
create trigger tenancies_touch before update on public.tenancies
  for each row execute function app.touch_updated_at();

-- Rent changes apply from an effective date; history is kept.
create table public.tenancy_rent_rates (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  effective_from date not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (tenancy_id, effective_from)
);

create table public.rent_charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  unit_id uuid not null references public.units (id),
  tenancy_id uuid not null references public.tenancies (id),
  -- rent: monthly rent; opening_balance: arrears brought forward at the cut-off date;
  -- utility / other: identifiable non-rent charges kept out of the rent-only view.
  category text not null check (category in ('rent', 'opening_balance', 'utility', 'other')),
  period_start date not null check (extract(day from period_start) = 1),
  due_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index rent_charges_one_rent_per_period
  on public.rent_charges (tenancy_id, period_start) where category = 'rent';
create index rent_charges_property_period_idx on public.rent_charges (property_id, period_start);
create index rent_charges_tenancy_idx on public.rent_charges (tenancy_id);

-- Waivers, prorating and voids: explicit staff decisions with a reason. Never edits.
create table public.charge_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  charge_id uuid not null references public.rent_charges (id),
  amount numeric(12, 2) not null check (amount < 0),
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index charge_adjustments_charge_idx on public.charge_adjustments (charge_id);

create sequence public.payment_entry_ref_seq start 1001;

create table public.payment_entries (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('PE-' || lpad(nextval('public.payment_entry_ref_seq')::text, 6, '0')),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  unit_id uuid not null references public.units (id),
  tenancy_id uuid not null references public.tenancies (id),
  kind text not null default 'payment' check (kind in ('payment', 'opening_credit')),
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  method text check (method in ('mpesa', 'bank', 'cash', 'other')),
  reference text check (length(reference) <= 80),
  notes text check (length(notes) <= 1000),
  -- Proposed allocation lines [{charge_id, amount}] until confirmation posts them.
  proposed_allocations jsonb not null default '[]'::jsonb,
  status text not null check (status in
    ('draft', 'awaiting_confirmation', 'returned', 'not_accepted', 'confirmed', 'reversed')),
  recorded_by uuid not null references public.profiles (id),
  recorded_at timestamptz not null default now(),
  -- Current owner of open work (moves when staff access is suspended/removed).
  assigned_to uuid references public.profiles (id),
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_reason text check (length(decision_reason) <= 500),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  confirm_acknowledged boolean not null default false,
  reversed_by uuid references public.profiles (id),
  reversed_at timestamptz,
  reversal_reason text check (length(reversal_reason) <= 500),
  replaces_entry_id uuid references public.payment_entries (id),
  client_request_id uuid not null unique,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'confirmed' or (confirmed_by is not null and confirmed_at is not null)),
  check (status <> 'reversed' or (reversed_by is not null and reversal_reason is not null))
);
create index payment_entries_property_status_idx on public.payment_entries (property_id, status);
create index payment_entries_tenancy_idx on public.payment_entries (tenancy_id);
create trigger payment_entries_touch before update on public.payment_entries
  for each row execute function app.touch_updated_at();

create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  tenancy_id uuid not null references public.tenancies (id),
  entry_id uuid not null references public.payment_entries (id),
  charge_id uuid not null references public.rent_charges (id),
  amount numeric(12, 2) not null check (amount <> 0),
  reverses_allocation_id uuid unique references public.allocations (id),
  posted_by uuid references public.profiles (id),
  posted_at timestamptz not null default now(),
  check ((amount > 0) = (reverses_allocation_id is null))
);
create index allocations_charge_idx on public.allocations (charge_id);
create index allocations_entry_idx on public.allocations (entry_id);
create index allocations_property_idx on public.allocations (property_id, posted_at);

create table public.entry_events (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.payment_entries (id),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  action text not null check (action in ('created', 'edited', 'submitted', 'returned',
    'not_accepted', 'confirmed', 'reversed', 'replaced', 'reassigned', 'credit_applied')),
  actor_id uuid references public.profiles (id),
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index entry_events_entry_idx on public.entry_events (entry_id, created_at);
create index entry_events_property_idx on public.entry_events (property_id, created_at desc);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  entry_id uuid references public.payment_entries (id),
  tenancy_id uuid references public.tenancies (id),
  kind text not null default 'payment_evidence'
    check (kind in ('payment_evidence', 'tenancy_document')),
  storage_path text not null unique,
  file_name text not null check (length(file_name) <= 200),
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 15728640),
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id)
);
create index attachments_entry_idx on public.attachments (entry_id);

create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  period_start date not null check (extract(day from period_start) = 1),
  version int not null check (version >= 1),
  snapshot jsonb not null,
  notes text check (length(notes) <= 4000),
  change_note text check (length(change_note) <= 1000),
  prepared_by uuid not null references public.profiles (id),
  finalized_at timestamptz not null default now(),
  unique (property_id, period_start, version)
);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Allocations can never be updated or deleted; reversals are new rows.
create or replace function app.block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Records in % are append-only', tg_table_name;
end $$;

create trigger allocations_append_only before update or delete on public.allocations
  for each row execute function app.block_mutation();
create trigger entry_events_append_only before update or delete on public.entry_events
  for each row execute function app.block_mutation();
create trigger charge_adjustments_append_only before update or delete on public.charge_adjustments
  for each row execute function app.block_mutation();
create trigger report_versions_append_only before update or delete on public.report_versions
  for each row execute function app.block_mutation();

-- Confirmed or reversed entries cannot be deleted, and their money facts cannot change.
create or replace function app.protect_entries() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payment entries are never deleted';
  end if;
  if old.status in ('confirmed', 'reversed') and (
       new.amount <> old.amount or new.paid_on <> old.paid_on or new.tenancy_id <> old.tenancy_id
       or new.confirmed_by is distinct from old.confirmed_by
       or new.confirmed_at is distinct from old.confirmed_at) then
    raise exception 'A confirmed entry cannot be edited. Reverse it and post a correction.';
  end if;
  if old.status = 'reversed' and new.status <> 'reversed' then
    raise exception 'A reversed entry stays reversed';
  end if;
  return new;
end $$;
create trigger payment_entries_protect before update or delete on public.payment_entries
  for each row execute function app.protect_entries();

-- Unit occupancy must agree with tenancies.
create or replace function app.check_unit_occupancy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_active boolean;
begin
  select exists (select 1 from public.tenancies t where t.unit_id = new.id and t.status = 'active')
    into v_active;
  if v_active and new.occupancy not in ('occupied', 'notice_given') then
    perform app.raise_error('unit_has_tenancy',
      'This unit has a current tenancy. End the tenancy before marking it ' || new.occupancy || '.');
  end if;
  if not v_active and new.occupancy in ('occupied', 'notice_given') then
    perform app.raise_error('unit_no_tenancy',
      'Add a tenancy to mark this unit occupied, so rent can be tracked.');
  end if;
  return new;
end $$;
create trigger units_check_occupancy before update of occupancy on public.units
  for each row when (old.occupancy is distinct from new.occupancy)
  execute function app.check_unit_occupancy();

-- ---------------------------------------------------------------------------
-- RLS: rent records are visible to staff with view access on the property, and (if a
-- tenant login is linked) to that tenant for their own tenancy. Platform admins have no
-- routine access to rent records. All writes go through RPCs.
-- ---------------------------------------------------------------------------

create or replace function app.is_tenant_of(p_tenancy uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenancies t join public.tenants tn on tn.id = t.tenant_id
    where t.id = p_tenancy and tn.user_id = auth.uid() and auth.uid() is not null)
$$;
grant execute on function app.is_tenant_of(uuid) to anon, authenticated;

alter table public.tenants enable row level security;
alter table public.tenancies enable row level security;
alter table public.tenancy_rent_rates enable row level security;
alter table public.rent_charges enable row level security;
alter table public.charge_adjustments enable row level security;
alter table public.payment_entries enable row level security;
alter table public.allocations enable row level security;
alter table public.entry_events enable row level security;
alter table public.attachments enable row level security;
alter table public.report_versions enable row level security;

create policy tenants_select on public.tenants for select to authenticated
  using (
    user_id = auth.uid()
    or app.is_org_admin(org_id)
    or exists (select 1 from public.tenancies t
               where t.tenant_id = tenants.id and app.can(t.property_id, 'view')));

create policy tenancies_select on public.tenancies for select to authenticated
  using (app.can(property_id, 'view') or app.is_tenant_of(id));

create policy tenancy_rent_rates_select on public.tenancy_rent_rates for select to authenticated
  using (exists (select 1 from public.tenancies t where t.id = tenancy_id
                 and (app.can(t.property_id, 'view') or app.is_tenant_of(t.id))));

create policy rent_charges_select on public.rent_charges for select to authenticated
  using (app.can(property_id, 'view') or app.is_tenant_of(tenancy_id));

create policy charge_adjustments_select on public.charge_adjustments for select to authenticated
  using (app.can(property_id, 'view')
         or exists (select 1 from public.rent_charges c where c.id = charge_id and app.is_tenant_of(c.tenancy_id)));

create policy payment_entries_select on public.payment_entries for select to authenticated
  using (app.can(property_id, 'view') or (status = 'confirmed' and app.is_tenant_of(tenancy_id)));

create policy allocations_select on public.allocations for select to authenticated
  using (app.can(property_id, 'view') or app.is_tenant_of(tenancy_id));

create policy entry_events_select on public.entry_events for select to authenticated
  using (app.can(property_id, 'view'));

create policy attachments_select on public.attachments for select to authenticated
  using (app.can(property_id, 'view_attachments') or uploaded_by = auth.uid());

create policy report_versions_select on public.report_versions for select to authenticated
  using (app.can(property_id, 'view'));

revoke all on public.tenants, public.tenancies, public.tenancy_rent_rates, public.rent_charges,
  public.charge_adjustments, public.payment_entries, public.allocations, public.entry_events,
  public.attachments, public.report_versions from anon;
revoke insert, update, delete on public.tenants, public.tenancies, public.tenancy_rent_rates,
  public.rent_charges, public.charge_adjustments, public.payment_entries, public.allocations,
  public.entry_events, public.attachments, public.report_versions from authenticated;
revoke all on sequence public.payment_entry_ref_seq from anon, authenticated;
