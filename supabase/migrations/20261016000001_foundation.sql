-- Foundation: identity, workspaces (organizations), team memberships, property/unit
-- structure, audit trail, in-app notifications and the delivery outbox.
--
-- Conventions
--  * Every exposed table has RLS enabled. Financial and state transitions go through
--    SECURITY DEFINER functions that re-check permissions on every call.
--  * Helper functions live in the `app` schema, which PostgREST does not expose.
--  * Money is numeric(12,2). Reporting timezone defaults to Africa/Nairobi.

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Small utilities
-- ---------------------------------------------------------------------------

create or replace function app.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Nairobi')::date
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.new_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function app.hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

create or replace function app.raise_error(p_code text, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  -- The code is placed in DETAIL so the app can map it to friendly copy.
  raise exception using message = p_message, detail = p_code, errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Profiles and platform staff
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 120),
  email text,
  phone text,
  last_role text check (last_role in ('tenant', 'workspace')),
  last_org_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'reviewer', 'support')),
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Workspaces (a landlord's or an agency's account)
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  kind text not null check (kind in ('landlord', 'agency')),
  -- How the advertiser is shown to tenants on listings.
  advertiser_role text not null default 'owner'
    check (advertiser_role in ('owner', 'agent', 'property_manager', 'caretaker')),
  timezone text not null default 'Africa/Nairobi',
  currency text not null default 'KES',
  contact_phone text,
  contact_whatsapp text,
  contact_email text,
  usually_replies text,
  -- Onboarding is separate from registration and from listing approval.
  onboarding_status text not null default 'new'
    check (onboarding_status in ('new', 'in_review', 'approved', 'changes_needed', 'rejected')),
  onboarding_assignee uuid references public.profiles (id),
  onboarding_note text,
  identity_checked_at date,
  authority_checked_at date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  county text,
  town text,
  area text not null check (length(trim(area)) between 2 and 120),
  road text,
  landmark text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  building_style text,
  owner_label text,
  description text check (length(description) <= 4000),
  viewing_address text,
  rent_due_day int not null default 5 check (rent_due_day between 1 and 28),
  evidence_policy text not null default 'optional' check (evidence_policy in ('optional', 'required')),
  auto_charges boolean not null default false,
  property_visited_at date,
  archived_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_org_idx on public.properties (org_id);
create trigger properties_touch before update on public.properties
  for each row execute function app.touch_updated_at();

create table public.units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 40),
  rental_scope text not null default 'entire_home'
    check (rental_scope in ('entire_home', 'private_room', 'shared_room', 'bedspace')),
  layout text not null default 'bedsitter_studio'
    check (layout in ('single_room', 'double_room', 'multiroom', 'bedsitter_studio', 'bedroom_home')),
  bedrooms int check (bedrooms between 0 and 30),
  bathrooms int check (bathrooms between 0 and 30),
  floor_level int check (floor_level between -5 and 100),
  size_sqm numeric(8, 2) check (size_sqm > 0),
  default_rent numeric(12, 2) check (default_rent >= 0),
  occupancy text not null default 'vacant'
    check (occupancy in ('occupied', 'notice_given', 'vacant', 'reserved', 'unavailable')),
  occupancy_date date,
  -- Facts are Yes / No / Unknown: {"private_bathroom":"yes","parking":"unknown",...}
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index units_label_unique on public.units (property_id, lower(label));
create index units_org_idx on public.units (org_id);
create trigger units_touch before update on public.units
  for each row execute function app.touch_updated_at();

-- Keep org_id consistent with the parent property.
create or replace function app.unit_set_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.org_id into new.org_id from public.properties p where p.id = new.property_id;
  return new;
end $$;
create trigger units_set_org before insert or update of property_id on public.units
  for each row execute function app.unit_set_org();

-- ---------------------------------------------------------------------------
-- Team memberships. Ownership, property assignment and authority to confirm records
-- are separate controls.
-- ---------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id),
  role text not null check (role in ('owner', 'agency_admin', 'manager', 'caretaker', 'viewer')),
  status text not null check (status in ('invited', 'active', 'suspended', 'removed')),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  invited_email text,
  invited_phone text,
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  invited_by uuid references public.profiles (id),
  accepted_at timestamptz,
  all_properties boolean not null default false,
  can_manage_tenancies boolean not null default false,
  can_enter_payments boolean not null default false,
  can_confirm boolean not null default false,
  can_correct boolean not null default false,
  can_export boolean not null default false,
  can_view_attachments boolean not null default false,
  can_manage_listings boolean not null default false,
  last_active_at timestamptz,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'invited' or invited_email is not null)
);
create unique index memberships_one_live_per_user
  on public.memberships (org_id, user_id)
  where user_id is not null and status in ('invited', 'active', 'suspended');
create unique index memberships_one_invite_per_email
  on public.memberships (org_id, lower(invited_email))
  where status = 'invited';
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create trigger memberships_touch before update on public.memberships
  for each row execute function app.touch_updated_at();

create table public.membership_properties (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, property_id)
);
create index membership_properties_property_idx on public.membership_properties (property_id);

-- ---------------------------------------------------------------------------
-- Permission helpers. Every policy and every RPC uses these, so a suspended or removed
-- membership loses access on the very next request, even with a live sign-in session.
-- ---------------------------------------------------------------------------

create or replace function app.org_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  limit 1
$$;

create or replace function app.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.org_role(p_org) in ('owner', 'agency_admin'), false)
$$;

create or replace function app.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.org_role(p_org) is not null
$$;

-- p_perm: view | manage_tenancies | enter_payments | confirm | correct | export |
--         view_attachments | manage_listings
create or replace function app.can(p_property uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.properties p
    join public.memberships m on m.org_id = p.org_id
    where p.id = p_property
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.role in ('owner', 'agency_admin')
        or (
          (m.all_properties or exists (
            select 1 from public.membership_properties mp
            where mp.membership_id = m.id and mp.property_id = p.id))
          and case p_perm
            when 'view' then true
            when 'manage_tenancies' then m.can_manage_tenancies
            when 'enter_payments' then m.can_enter_payments
            when 'confirm' then m.can_confirm
            when 'correct' then m.can_correct
            when 'export' then m.can_export
            when 'view_attachments' then m.can_view_attachments
            when 'manage_listings' then m.can_manage_listings
            else false
          end
        )
      )
  )
$$;

create or replace function app.require(p_property uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    perform app.raise_error('not_signed_in', 'Sign in to continue.');
  end if;
  if not app.can(p_property, p_perm) then
    perform app.raise_error('forbidden', 'You do not have permission for this action on this property.');
  end if;
end $$;

create or replace function app.current_membership(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.memberships m
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  limit 1
$$;

create or replace function app.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.org_id = a.org_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_user and b.status in ('active', 'suspended', 'removed')
  )
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit, notifications and delivery outbox
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  actor_id uuid references public.profiles (id),
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (org_id, created_at desc);

create or replace function app.audit(
  p_org uuid, p_property uuid, p_action text, p_target_type text, p_target_id text,
  p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (org_id, property_id, actor_id, action, target_type, target_id, details)
  values (p_org, p_property, auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;

-- In-app activity centre: the reference record for every alert.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  event_key text not null,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- One row per logical event x recipient x channel. Provider calls happen in a worker.
create table public.delivery_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  event_key text not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'push')),
  destination text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'cancelled')),
  attempts int not null default 0,
  last_error text,
  provider_ref text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_key, channel, destination)
);
create index delivery_tasks_due_idx on public.delivery_tasks (status, next_attempt_at);
create trigger delivery_tasks_touch before update on public.delivery_tasks
  for each row execute function app.touch_updated_at();

create or replace function app.notify(
  p_user uuid, p_org uuid, p_event_key text, p_kind text, p_title text, p_body text, p_link text
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, org_id, event_key, kind, title, body, link)
  values (p_user, p_org, p_event_key, p_kind, p_title, p_body, p_link)
  on conflict (user_id, event_key) do nothing
$$;

create or replace function app.queue_delivery(
  p_org uuid, p_event_key text, p_channel text, p_destination text, p_template text, p_payload jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.delivery_tasks (org_id, event_key, channel, destination, template, payload)
  select p_org, p_event_key, p_channel, p_destination, p_template, coalesce(p_payload, '{}'::jsonb)
  where p_destination is not null and length(trim(p_destination)) > 0
  on conflict (event_key, channel, destination) do nothing
$$;

-- ---------------------------------------------------------------------------
-- Registration: create the profile and alert administrators about every new account.
-- ---------------------------------------------------------------------------

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_admin record;
  v_alert_email text;
begin
  insert into public.profiles (id, full_name, email, phone)
  values (new.id, v_name, new.email, new.phone)
  on conflict (id) do nothing;

  for v_admin in
    select a.user_id, p.email from public.platform_admins a join public.profiles p on p.id = a.user_id
  loop
    perform app.notify(v_admin.user_id, null, 'registration:' || new.id, 'registration',
      'New account registered', coalesce(nullif(v_name, ''), 'A new user') || ' created an account.',
      '/admin/onboarding');
    perform app.queue_delivery(null, 'registration:' || new.id, 'email', v_admin.email,
      'admin_registration', jsonb_build_object('user_id', new.id, 'name', v_name,
        'registered_at', new.created_at));
  end loop;

  select s.value into v_alert_email from public.app_settings s where s.key = 'admin_alert_email';
  perform app.queue_delivery(null, 'registration:' || new.id, 'email', v_alert_email,
    'admin_registration', jsonb_build_object('user_id', new.id, 'name', v_name,
      'registered_at', new.created_at));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

create or replace function app.sync_user_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email, phone = new.phone where id = new.id;
  return new;
end $$;

create trigger on_auth_user_contact_changed after update of email, phone on auth.users
  for each row execute function app.sync_user_contact();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.organizations enable row level security;
alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_properties enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;
alter table public.delivery_tasks enable row level security;

-- Profiles: yourself, colleagues in a shared workspace, and platform admins.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.shares_org_with(id) or app.is_platform_admin());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, last_role, last_org_id) on public.profiles to authenticated;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profiles from anon;

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());
revoke all on public.platform_admins from anon;
revoke insert, update, delete on public.platform_admins from authenticated;

revoke all on public.app_settings from anon, authenticated;

-- Organizations: members see their workspace; admins see all. Writes through RPCs, except
-- a limited set of contact columns the workspace admin may edit.
create policy organizations_select on public.organizations for select to authenticated
  using (app.is_org_member(id) or app.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (app.is_org_admin(id)) with check (app.is_org_admin(id));
revoke all on public.organizations from anon;
revoke insert, update, delete on public.organizations from authenticated;
grant update (name, contact_phone, contact_whatsapp, contact_email, usually_replies)
  on public.organizations to authenticated;

-- Properties: assigned staff can view; workspace admins create and edit.
-- The org-admin branch also covers INSERT ... RETURNING, where the new row is not yet
-- visible to app.can()'s snapshot.
create policy properties_select on public.properties for select to authenticated
  using (app.is_org_admin(org_id) or app.can(id, 'view'));
create policy properties_insert on public.properties for insert to authenticated
  with check (app.is_org_admin(org_id));
create policy properties_update on public.properties for update to authenticated
  using (app.is_org_admin(org_id)) with check (app.is_org_admin(org_id));
revoke all on public.properties from anon;
revoke update, delete on public.properties from authenticated;
grant update (name, county, town, area, road, landmark, latitude, longitude, building_style,
  owner_label, description, viewing_address, rent_due_day, evidence_policy, auto_charges, archived_at)
  on public.properties to authenticated;

-- Units: assigned staff view; admins, tenancy managers and listing managers edit.
create policy units_select on public.units for select to authenticated
  using (app.can(property_id, 'view'));
create policy units_insert on public.units for insert to authenticated
  with check (app.can(property_id, 'manage_tenancies') or app.can(property_id, 'manage_listings'));
create policy units_update on public.units for update to authenticated
  using (app.can(property_id, 'manage_tenancies') or app.can(property_id, 'manage_listings'))
  with check (app.can(property_id, 'manage_tenancies') or app.can(property_id, 'manage_listings'));
revoke all on public.units from anon;
revoke update, delete on public.units from authenticated;
grant update (label, rental_scope, layout, bedrooms, bathrooms, floor_level, size_sqm, default_rent,
  occupancy, occupancy_date, facts) on public.units to authenticated;

-- Memberships: managers never see other people's access. Admins see their whole team.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or app.is_org_admin(org_id));
revoke all on public.memberships from anon;
revoke select, insert, update, delete on public.memberships from authenticated;
-- Everything except the invitation token hash.
grant select (id, org_id, user_id, role, status, display_name, invited_email, invited_phone,
  invite_expires_at, invited_by, accepted_at, all_properties, can_manage_tenancies,
  can_enter_payments, can_confirm, can_correct, can_export, can_view_attachments,
  can_manage_listings, last_active_at, status_changed_at, status_changed_by, created_at, updated_at)
  on public.memberships to authenticated;

create policy membership_properties_select on public.membership_properties for select to authenticated
  using (exists (
    select 1 from public.memberships m where m.id = membership_id
      and (m.user_id = auth.uid() or app.is_org_admin(m.org_id))));
revoke all on public.membership_properties from anon;
revoke insert, update, delete on public.membership_properties from authenticated;

create policy audit_events_select on public.audit_events for select to authenticated
  using ((org_id is not null and app.is_org_admin(org_id)) or app.is_platform_admin());
revoke all on public.audit_events from anon;
revoke insert, update, delete on public.audit_events from authenticated;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notifications from anon;
revoke insert, delete, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy delivery_tasks_select on public.delivery_tasks for select to authenticated
  using (app.is_platform_admin() or (org_id is not null and app.is_org_admin(org_id)));
revoke all on public.delivery_tasks from anon;
revoke insert, update, delete on public.delivery_tasks from authenticated;
