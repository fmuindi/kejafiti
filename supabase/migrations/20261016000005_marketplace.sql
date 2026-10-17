-- Marketplace: listings with structured costs, photos, saved homes and searches,
-- listing-based conversations, viewing appointments, contact attempts and reports.
--
-- Separate state models: listing publication, unit occupancy, enquiry follow-up and viewing
-- appointments are stored independently. Changing one never silently changes another,
-- except where stated (marking a listing let cancels open viewing requests and tells the
-- tenant).

alter table public.units
  add column building_style text check (building_style in ('apartment', 'bungalow', 'maisonette',
    'townhouse', 'terraced_house', 'villa', 'mansion', 'cottage', 'farmhouse', 'other')),
  add column origin text check (origin in ('dsq', 'guest_wing', 'conversion'));
grant update (building_style, origin) on public.units to authenticated;


create sequence public.listing_ref_seq start 4001;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('L-' || nextval('public.listing_ref_seq')::text),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  unit_id uuid not null references public.units (id),
  status text not null default 'draft' check (status in
    ('draft', 'under_review', 'published', 'paused', 'needs_correction', 'let', 'withdrawn')),
  title text check (length(title) <= 140),
  description text check (length(description) <= 4000),
  price_period text not null default 'month' check (price_period in ('month', 'week', 'night', 'semester')),
  price_basis text not null default 'entire_unit'
    check (price_basis in ('entire_unit', 'per_person', 'per_bed', 'per_room')),
  rent_amount numeric(12, 2) check (rent_amount > 0),
  deposit_months numeric(4, 2) check (deposit_months >= 0 and deposit_months <= 12),
  deposit_amount numeric(12, 2) check (deposit_amount >= 0),
  furnishing text check (furnishing in ('unfurnished', 'partly', 'fully')),
  student boolean not null default false,
  available_from date,
  availability_confirmed_at timestamptz,
  availability_confirmed_by uuid references public.profiles (id),
  contact_call boolean not null default true,
  contact_whatsapp boolean not null default false,
  contact_phone text,
  viewing_instructions text check (length(viewing_instructions) <= 1000),
  house_rules text check (length(house_rules) <= 2000),
  wizard_step int not null default 1 check (wizard_step between 1 and 6),
  -- Computed by app.recompute_listing_totals; never edited directly.
  fixed_monthly_total numeric(12, 2),
  move_in_total numeric(12, 2),
  totals_complete boolean not null default false,
  flags jsonb not null default '[]'::jsonb,
  review_note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  submitted_at timestamptz,
  published_at timestamptz,
  let_on date,
  sponsored_until timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_status_idx on public.listings (status, published_at desc);
create index listings_property_idx on public.listings (property_id);
create trigger listings_touch before update on public.listings
  for each row execute function app.touch_updated_at();

create table public.listing_charges (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind text not null check (kind in ('service_charge', 'water', 'electricity', 'garbage', 'security',
    'internet', 'parking', 'utility_deposit', 'other_deposit', 'agency_fee', 'viewing_fee', 'other')),
  label text check (length(label) <= 80),
  -- null amount on a fixed charge means "Charge not confirmed".
  amount numeric(12, 2) check (amount >= 0),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'one_off')),
  billing text not null default 'fixed' check (billing in ('fixed', 'metered', 'included', 'unknown')),
  compulsory boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index listing_charges_listing_idx on public.listing_charges (listing_id);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  storage_path text not null unique,
  -- Smaller copy for result cards, generated in the browser before upload.
  thumb_path text unique,
  position int not null default 0,
  is_cover boolean not null default false,
  media_label text not null default 'actual_unit' check (media_label in ('actual_unit', 'building', 'sample')),
  alt_text text check (length(alt_text) <= 200),
  width int,
  height int,
  size_bytes int check (size_bytes > 0 and size_bytes <= 15728640),
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, position);

create table public.saved_listings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (length(label) <= 120),
  params jsonb not null,
  alert_frequency text not null default 'daily' check (alert_frequency in ('instant', 'daily', 'off')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  tenant_id uuid not null references public.profiles (id),
  follow_up text not null default 'new' check (follow_up in ('new', 'contacted', 'viewing_planned', 'closed')),
  assigned_membership_id uuid references public.memberships (id),
  last_message_at timestamptz,
  last_tenant_message_at timestamptz,
  last_advertiser_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, tenant_id)
);
create index conversations_org_idx on public.conversations (org_id, last_message_at desc);
create index conversations_tenant_idx on public.conversations (tenant_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  sender_side text not null check (sender_side in ('tenant', 'advertiser', 'system')),
  body text not null check (length(trim(body)) between 1 and 4000),
  client_ref uuid unique,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.viewings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  conversation_id uuid references public.conversations (id),
  tenant_id uuid not null references public.profiles (id),
  requested_start timestamptz not null,
  proposed_start timestamptz,
  confirmed_start timestamptz,
  status text not null default 'requested' check (status in ('requested', 'new_time_proposed', 'confirmed',
    'declined', 'cancelled', 'attended', 'not_attended', 'unknown')),
  tenant_note text check (length(tenant_note) <= 500),
  decline_reason text check (length(decline_reason) <= 500),
  cancel_reason text check (length(cancel_reason) <= 500),
  cancelled_by_side text check (cancelled_by_side in ('tenant', 'advertiser', 'system')),
  meeting_instructions text check (length(meeting_instructions) <= 1000),
  client_ref uuid unique,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index viewings_org_idx on public.viewings (org_id, status);
create index viewings_tenant_idx on public.viewings (tenant_id);
create trigger viewings_touch before update on public.viewings
  for each row execute function app.touch_updated_at();

create table public.contact_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid references public.profiles (id),
  channel text not null check (channel in ('call', 'whatsapp')),
  created_at timestamptz not null default now()
);

create table public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id),
  reason text not null check (reason in ('unavailable', 'wrong_price', 'inaccurate_location',
    'misleading_media', 'duplicate', 'suspicious_payment_request', 'other')),
  details text check (length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cost totals (single definition, recomputed on every change)
--   fixed monthly = rent + compulsory fixed monthly charges not included in rent
--   move-in       = first month (fixed monthly) + deposit + compulsory one-off charges
--   complete      = no compulsory fixed charge has an unconfirmed amount
-- ---------------------------------------------------------------------------

create or replace function app.recompute_listing_totals(p_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_l public.listings;
  v_monthly numeric;
  v_one_off numeric;
  v_incomplete boolean;
  v_deposit numeric;
begin
  select * into v_l from public.listings where id = p_listing;
  if v_l.id is null then return; end if;
  select
    coalesce(sum(amount) filter (where frequency = 'monthly' and billing = 'fixed' and compulsory), 0),
    coalesce(sum(amount) filter (where frequency = 'one_off' and billing = 'fixed' and compulsory), 0),
    coalesce(bool_or(amount is null and billing = 'fixed' and compulsory), false)
    into v_monthly, v_one_off, v_incomplete
  from public.listing_charges where listing_id = p_listing;

  v_deposit := coalesce(v_l.deposit_amount, v_l.deposit_months * v_l.rent_amount, 0);
  update public.listings set
    fixed_monthly_total = case when v_l.rent_amount is null then null else v_l.rent_amount + v_monthly end,
    move_in_total = case when v_l.rent_amount is null then null
                         else v_l.rent_amount + v_monthly + v_deposit + v_one_off end,
    totals_complete = v_l.rent_amount is not null and not v_incomplete
      and (v_l.deposit_amount is not null or v_l.deposit_months is not null)
  where id = p_listing;
end $$;

create or replace function app.listing_totals_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'listing_charges' then
    perform app.recompute_listing_totals(coalesce(new.listing_id, old.listing_id));
  elsif tg_op = 'INSERT' or new.rent_amount is distinct from old.rent_amount
        or new.deposit_amount is distinct from old.deposit_amount
        or new.deposit_months is distinct from old.deposit_months then
    perform app.recompute_listing_totals(new.id);
  end if;
  return null;
end $$;
create trigger listing_charges_totals after insert or update or delete on public.listing_charges
  for each row execute function app.listing_totals_trigger();
create trigger listings_totals after insert or update of rent_amount, deposit_amount, deposit_months
  on public.listings for each row execute function app.listing_totals_trigger();

-- Listing org/property follow the unit.
create or replace function app.listing_set_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select u.org_id, u.property_id into new.org_id, new.property_id from public.units u where u.id = new.unit_id;
  return new;
end $$;
create trigger listings_set_scope before insert on public.listings
  for each row execute function app.listing_set_scope();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.listings enable row level security;
alter table public.listing_charges enable row level security;
alter table public.listing_photos enable row level security;
alter table public.saved_listings enable row level security;
alter table public.saved_searches enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.viewings enable row level security;
alter table public.contact_events enable row level security;
alter table public.listing_reports enable row level security;

-- Staff with listing permission manage their listings. The public reads listings only
-- through search_listings / get_listing, which return safe fields of published listings.
create policy listings_select on public.listings for select to authenticated
  using (app.can(property_id, 'manage_listings') or app.can(property_id, 'view') or app.is_platform_admin());
create policy listings_insert on public.listings for insert to authenticated
  with check (app.can(property_id, 'manage_listings'));
create policy listings_update on public.listings for update to authenticated
  using (app.can(property_id, 'manage_listings')) with check (app.can(property_id, 'manage_listings'));
revoke all on public.listings from anon;
revoke update, delete on public.listings from authenticated;
grant update (title, description, price_period, price_basis, rent_amount, deposit_months, deposit_amount,
  furnishing, student, available_from, contact_call, contact_whatsapp, contact_phone, viewing_instructions,
  house_rules, wizard_step) on public.listings to authenticated;

create policy listing_charges_all on public.listing_charges for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and app.can(l.property_id, 'manage_listings')))
  with check (exists (select 1 from public.listings l where l.id = listing_id and app.can(l.property_id, 'manage_listings')));
create policy listing_charges_admin on public.listing_charges for select to authenticated
  using (app.is_platform_admin());
revoke all on public.listing_charges from anon;

create policy listing_photos_all on public.listing_photos for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and app.can(l.property_id, 'manage_listings')))
  with check (exists (select 1 from public.listings l where l.id = listing_id and app.can(l.property_id, 'manage_listings')));
create policy listing_photos_admin on public.listing_photos for select to authenticated
  using (app.is_platform_admin());
revoke all on public.listing_photos from anon;

create policy saved_listings_own on public.saved_listings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.saved_listings from anon;
create policy saved_searches_own on public.saved_searches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.saved_searches from anon;

create or replace function app.can_see_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation and (
      c.tenant_id = auth.uid()
      or app.can(c.property_id, 'manage_listings')
      or exists (select 1 from public.memberships m where m.id = c.assigned_membership_id
                 and m.user_id = auth.uid() and m.status = 'active')))
$$;
grant execute on function app.can_see_conversation(uuid) to authenticated;

create policy conversations_select on public.conversations for select to authenticated
  using (app.can_see_conversation(id));
revoke all on public.conversations from anon;
revoke insert, update, delete on public.conversations from authenticated;

create policy messages_select on public.messages for select to authenticated
  using (app.can_see_conversation(conversation_id));
revoke all on public.messages from anon;
revoke insert, update, delete on public.messages from authenticated;

create policy conversation_reads_own on public.conversation_reads for select to authenticated
  using (user_id = auth.uid());
revoke all on public.conversation_reads from anon;
revoke insert, update, delete on public.conversation_reads from authenticated;

create policy viewings_select on public.viewings for select to authenticated
  using (tenant_id = auth.uid() or app.can(property_id, 'manage_listings')
         or (conversation_id is not null and app.can_see_conversation(conversation_id)));
revoke all on public.viewings from anon;
revoke insert, update, delete on public.viewings from authenticated;

revoke all on public.contact_events from anon, authenticated;

create policy listing_reports_select on public.listing_reports for select to authenticated
  using (reporter_id = auth.uid() or app.is_platform_admin());
revoke all on public.listing_reports from anon;
revoke insert, update, delete on public.listing_reports from authenticated;
revoke all on sequence public.listing_ref_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Listing lifecycle
-- ---------------------------------------------------------------------------

-- "List a home": create (or reuse) the property and unit behind the scenes, then a draft.
-- p: {org_id, property_id?, property_name?, area, town?, county?, road?, landmark?,
--     unit_id?, unit_label?, layout?, rental_scope?, bedrooms?}
create or replace function public.start_listing(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (p ->> 'org_id')::uuid;
  v_property uuid := nullif(p ->> 'property_id', '')::uuid;
  v_unit uuid := nullif(p ->> 'unit_id', '')::uuid;
  v_listing uuid;
  v_role text;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  if v_unit is not null then
    select property_id into v_property from public.units where id = v_unit;
    if v_property is null then perform app.raise_error('not_found', 'Unit not found.'); end if;
    perform app.require(v_property, 'manage_listings');
  elsif v_property is not null then
    perform app.require(v_property, 'manage_listings');
  else
    if not app.is_org_admin(v_org) then
      perform app.raise_error('forbidden', 'Only the workspace owner or an agency admin can add a property.');
    end if;
    if length(trim(coalesce(p ->> 'area', ''))) < 2 then
      perform app.raise_error('validation', 'Enter the area or estate, for example Ruaka.');
    end if;
    insert into public.properties (org_id, name, area, town, county, road, landmark, created_by)
    values (v_org, coalesce(nullif(trim(p ->> 'property_name'), ''), trim(p ->> 'area') || ' home'),
      trim(p ->> 'area'), nullif(trim(p ->> 'town'), ''), nullif(trim(p ->> 'county'), ''),
      nullif(trim(p ->> 'road'), ''), nullif(trim(p ->> 'landmark'), ''), auth.uid())
    returning id into v_property;
  end if;

  if v_unit is null then
    insert into public.units (org_id, property_id, label, layout, rental_scope, bedrooms)
    values (v_org, v_property, coalesce(nullif(trim(p ->> 'unit_label'), ''), 'Main'),
      coalesce(p ->> 'layout', 'bedsitter_studio'), coalesce(p ->> 'rental_scope', 'entire_home'),
      nullif(p ->> 'bedrooms', '')::int)
    returning id into v_unit;
  end if;

  if exists (select 1 from public.listings l where l.unit_id = v_unit
             and l.status in ('draft', 'under_review', 'published', 'paused', 'needs_correction')) then
    select id into v_listing from public.listings l where l.unit_id = v_unit
      and l.status in ('draft', 'under_review', 'published', 'paused', 'needs_correction') limit 1;
    return v_listing;
  end if;

  insert into public.listings (org_id, property_id, unit_id, rent_amount, created_by)
  select u.org_id, u.property_id, u.id, u.default_rent, auth.uid() from public.units u where u.id = v_unit
  returning id into v_listing;
  return v_listing;
end $$;

create or replace function app.listing_problems(p_listing uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when l.rent_amount is null then 'Enter the rent.' end,
    case when l.deposit_amount is null and l.deposit_months is null then 'Enter the deposit, or 0 if there is none.' end,
    case when l.available_from is null then 'Enter the date the home is available from.' end,
    case when coalesce(l.title, '') = '' then 'Add a short title.' end,
    case when (select count(*) from public.listing_photos ph where ph.listing_id = l.id) < 4
         then 'Add at least 4 photos of this unit.' end,
    case when not l.contact_call and not l.contact_whatsapp
         then 'Turn on at least one way for tenants to contact you.' end,
    case when (l.contact_call or l.contact_whatsapp) and coalesce(l.contact_phone, '') = ''
         then 'Enter the phone number tenants should use.' end
  ], null)
  from public.listings l where l.id = p_listing
$$;

create or replace function public.listing_problems(p_listing uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v_property uuid;
begin
  select property_id into v_property from public.listings where id = p_listing;
  perform app.require(v_property, 'manage_listings');
  return app.listing_problems(p_listing);
end $$;

create or replace function public.submit_listing(p_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings; v_problems text[]; v_flags jsonb := '[]'::jsonb; v_admin record;
begin
  select * into v_l from public.listings where id = p_listing for update;
  if v_l.id is null then perform app.raise_error('not_found', 'Listing not found.'); end if;
  perform app.require(v_l.property_id, 'manage_listings');
  if v_l.status not in ('draft', 'needs_correction') then
    perform app.raise_error('validation', 'This listing has already been submitted.');
  end if;
  v_problems := app.listing_problems(p_listing);
  if cardinality(v_problems) > 0 then
    perform app.raise_error('incomplete', array_to_string(v_problems, ' '));
  end if;

  if exists (select 1 from public.listings o where o.unit_id = v_l.unit_id and o.id <> v_l.id
             and o.status in ('under_review', 'published', 'paused')) then
    v_flags := v_flags || '["Another active listing exists for this unit"]'::jsonb;
  end if;
  if exists (select 1 from public.listings o join public.properties po on po.id = o.property_id
             join public.properties pl on pl.id = v_l.property_id
             where o.id <> v_l.id and o.status in ('under_review', 'published')
               and lower(o.title) = lower(v_l.title) and o.rent_amount = v_l.rent_amount
               and lower(po.area) = lower(pl.area)) then
    v_flags := v_flags || '["Possible duplicate: same title, rent and area"]'::jsonb;
  end if;
  if not v_l.totals_complete then
    v_flags := v_flags || '["A compulsory charge is not confirmed"]'::jsonb;
  end if;
  if exists (select 1 from public.listing_photos ph where ph.listing_id = p_listing and ph.media_label = 'sample') then
    v_flags := v_flags || '["Includes sample photos (labelled)"]'::jsonb;
  end if;

  update public.listings set status = 'under_review', submitted_at = now(), flags = v_flags,
    availability_confirmed_at = now(), availability_confirmed_by = auth.uid()
  where id = p_listing;
  for v_admin in select user_id from public.platform_admins loop
    perform app.notify(v_admin.user_id, null, 'listing_review:' || p_listing || ':' || extract(epoch from now()),
      'listing_review', 'Listing submitted for review', coalesce(v_l.title, v_l.ref), '/admin/listings');
  end loop;
end $$;

create or replace function public.set_listing_status(p_listing uuid, p_action text, p_date date default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings; v_v record;
begin
  select * into v_l from public.listings where id = p_listing for update;
  if v_l.id is null then perform app.raise_error('not_found', 'Listing not found.'); end if;
  perform app.require(v_l.property_id, 'manage_listings');
  case p_action
    when 'pause' then
      if v_l.status <> 'published' then perform app.raise_error('validation', 'Only published listings can be paused.'); end if;
      update public.listings set status = 'paused' where id = p_listing;
    when 'resume' then
      if v_l.status <> 'paused' then perform app.raise_error('validation', 'This listing is not paused.'); end if;
      update public.listings set status = 'published', availability_confirmed_at = now(),
        availability_confirmed_by = auth.uid() where id = p_listing;
    when 'withdraw', 'mark_let' then
      if v_l.status in ('let', 'withdrawn') then perform app.raise_error('validation', 'This listing is already closed.'); end if;
      update public.listings set status = case when p_action = 'mark_let' then 'let' else 'withdrawn' end,
        let_on = case when p_action = 'mark_let' then coalesce(p_date, app.today()) end
      where id = p_listing;
      if p_action = 'mark_let' and not exists (select 1 from public.tenancies t where t.unit_id = v_l.unit_id and t.status = 'active') then
        update public.units set occupancy = 'reserved', occupancy_date = coalesce(p_date, app.today()) where id = v_l.unit_id;
      end if;
      -- Open requests can no longer happen: cancel them and tell the tenant.
      for v_v in select * from public.viewings where listing_id = p_listing
                 and status in ('requested', 'new_time_proposed', 'confirmed') loop
        update public.viewings set status = 'cancelled', cancelled_by_side = 'system',
          cancel_reason = 'This home is no longer available.' where id = v_v.id;
        perform app.notify(v_v.tenant_id, null, 'viewing_cancelled:' || v_v.id, 'viewing_cancelled',
          'Viewing cancelled', 'The home is no longer available. Your request is kept in your history.',
          '/homes/' || v_l.ref);
      end loop;
    else
      perform app.raise_error('validation', 'Unknown action.');
  end case;
  perform app.audit(v_l.org_id, v_l.property_id, 'listing_' || p_action, 'listing', p_listing::text, '{}'::jsonb);
end $$;

-- One-tap "Still available" for one or many listings; per-listing results.
create or replace function public.confirm_still_available(p_listings uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_l public.listings; v_out jsonb := '[]'::jsonb;
begin
  foreach v_id in array p_listings loop
    select * into v_l from public.listings where id = v_id;
    if v_l.id is null or not app.can(v_l.property_id, 'manage_listings') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'error', 'Not permitted'));
    elsif v_l.status not in ('published', 'paused', 'under_review') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'error', 'Listing is not active'));
    else
      update public.listings set availability_confirmed_at = now(), availability_confirmed_by = auth.uid()
      where id = v_id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', true));
    end if;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Public discovery (anon allowed). Returns only public-safe fields of published listings.
-- params: {q, max_rent, min_rent, budget_basis: rent|fixed, home_types[], must_haves[],
--   include_unconfirmed, furnishing, listed_by, move_in_by, category, sort, limit, offset}
-- ---------------------------------------------------------------------------

create or replace function app.listing_fact(p_unit public.units, p_listing public.listings, p_key text)
returns text
language sql stable security definer set search_path = '' as $$
  select case p_key
    when 'water_included' then
      case when exists (select 1 from public.listing_charges c where c.listing_id = p_listing.id
                          and c.kind = 'water' and c.billing = 'included') then 'yes'
           when exists (select 1 from public.listing_charges c where c.listing_id = p_listing.id
                          and c.kind = 'water' and c.billing in ('metered', 'fixed')) then 'no'
           else 'unknown' end
    when 'ground_or_lift' then
      case when p_unit.floor_level = 0 or p_unit.facts ->> 'lift' = 'yes' then 'yes'
           when p_unit.floor_level is not null and p_unit.facts ->> 'lift' = 'no' then 'no'
           else 'unknown' end
    else coalesce(p_unit.facts ->> p_key, 'unknown')
  end
$$;

create or replace function public.search_listings(params jsonb)
returns table (ref text, title text, area text, town text, road text, layout text, bedrooms int,
  rental_scope text, building_style text, price_period text, price_basis text, rent_amount numeric,
  fixed_monthly_total numeric, move_in_total numeric, totals_complete boolean, charges jsonb, facts jsonb,
  floor_level int, furnishing text, available_from date, availability_confirmed_at timestamptz,
  advertiser_role text, sponsored boolean, cover_path text, photo_count int, published_at timestamptz,
  unconfirmed_match boolean, approx_lat numeric, approx_lng numeric, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(trim(params ->> 'q'), '');
  v_max numeric := nullif(params ->> 'max_rent', '')::numeric;
  v_min numeric := nullif(params ->> 'min_rent', '')::numeric;
  v_basis text := coalesce(params ->> 'budget_basis', 'rent');
  v_types text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(params -> 'home_types') x), '{}');
  v_must text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(params -> 'must_haves') x), '{}');
  v_unconf boolean := coalesce((params ->> 'include_unconfirmed')::boolean, false);
  v_furn text := nullif(params ->> 'furnishing', '');
  v_by text := nullif(params ->> 'listed_by', '');
  v_move date := nullif(params ->> 'move_in_by', '')::date;
  v_cat text := nullif(params ->> 'category', '');
  v_sort text := coalesce(params ->> 'sort', 'relevant');
  v_limit int := least(greatest(coalesce((params ->> 'limit')::int, 24), 1), 60);
  v_offset int := greatest(coalesce((params ->> 'offset')::int, 0), 0);
begin
  return query
  with base as (
    select l, u, p, o
    from public.listings l
    join public.units u on u.id = l.unit_id
    join public.properties p on p.id = l.property_id
    join public.organizations o on o.id = l.org_id
    where l.status = 'published'
      and (v_q is null or concat_ws(' ', p.area, p.town, p.county, p.road, p.landmark, l.title) ilike '%' || v_q || '%')
      and (v_max is null or (case when v_basis = 'fixed' then l.fixed_monthly_total else l.rent_amount end) <= v_max)
      and (v_min is null or l.rent_amount >= v_min)
      and (v_furn is null or (v_furn = 'furnished' and l.furnishing in ('partly', 'fully'))
           or (v_furn = 'unfurnished' and l.furnishing = 'unfurnished'))
      and (v_by is null or (v_by = 'landlord' and o.advertiser_role = 'owner')
           or (v_by = 'agent' and o.advertiser_role in ('agent', 'property_manager', 'caretaker')))
      and (v_move is null or l.available_from <= v_move)
      and (cardinality(v_types) = 0 or
           ('single_room' = any (v_types) and u.layout = 'single_room') or
           ('double_room' = any (v_types) and u.layout in ('double_room', 'multiroom')) or
           ('bedsitter_studio' = any (v_types) and u.layout = 'bedsitter_studio') or
           ('1_bedroom' = any (v_types) and u.layout = 'bedroom_home' and u.bedrooms = 1) or
           ('2_bedrooms' = any (v_types) and u.layout = 'bedroom_home' and u.bedrooms = 2) or
           ('3_plus_bedrooms' = any (v_types) and u.layout = 'bedroom_home' and u.bedrooms >= 3))
      and (v_cat is null or
           (v_cat = 'rooms' and u.layout in ('single_room', 'double_room', 'multiroom') and u.rental_scope = 'entire_home') or
           (v_cat = 'bedsitters' and u.layout = 'bedsitter_studio') or
           (v_cat = 'apartments' and u.layout = 'bedroom_home'
              and coalesce(u.building_style, p.building_style, 'apartment') = 'apartment') or
           (v_cat = 'houses' and coalesce(u.building_style, p.building_style) in
              ('bungalow', 'maisonette', 'townhouse', 'terraced_house', 'villa', 'mansion', 'cottage', 'farmhouse')) or
           (v_cat = 'sq' and u.origin in ('dsq', 'guest_wing')) or
           (v_cat = 'shared' and u.rental_scope in ('private_room', 'shared_room', 'bedspace')) or
           (v_cat = 'student' and l.student))
  ),
  scored as (
    select b.*,
      -- Must-haves: "yes" always matches; "unknown" matches only when the tenant includes
      -- unconfirmed answers; "no" never matches.
      coalesce((select bool_and(app.listing_fact(b.u, b.l, k) = 'yes') from unnest(v_must) k), true) as all_yes,
      coalesce((select bool_and(app.listing_fact(b.u, b.l, k) in ('yes', 'unknown')) from unnest(v_must) k), true) as yes_or_unknown
    from base b
  ),
  matched as (
    select s.* from scored s where s.all_yes or (v_unconf and s.yes_or_unknown)
  )
  select (m.l).ref, (m.l).title, (m.p).area, (m.p).town, (m.p).road, (m.u).layout, (m.u).bedrooms,
    (m.u).rental_scope, coalesce((m.u).building_style, (m.p).building_style), (m.l).price_period, (m.l).price_basis,
    (m.l).rent_amount, (m.l).fixed_monthly_total, (m.l).move_in_total, (m.l).totals_complete,
    (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'label', c.label, 'amount', c.amount,
       'frequency', c.frequency, 'billing', c.billing, 'compulsory', c.compulsory) order by c.position), '[]'::jsonb)
       from public.listing_charges c where c.listing_id = (m.l).id),
    (m.u).facts || jsonb_build_object('water_included', app.listing_fact(m.u, m.l, 'water_included'),
                                      'ground_or_lift', app.listing_fact(m.u, m.l, 'ground_or_lift')),
    (m.u).floor_level, (m.l).furnishing, (m.l).available_from, (m.l).availability_confirmed_at,
    (m.o).advertiser_role, coalesce((m.l).sponsored_until > now(), false),
    (select coalesce(ph.thumb_path, ph.storage_path) from public.listing_photos ph where ph.listing_id = (m.l).id
       order by ph.is_cover desc, ph.position limit 1),
    (select count(*)::int from public.listing_photos ph where ph.listing_id = (m.l).id),
    (m.l).published_at,
    not m.all_yes,
    round((m.p).latitude, 2), round((m.p).longitude, 2),
    count(*) over ()
  from matched m
  order by
    case when v_sort = 'lowest_total' then coalesce((m.l).fixed_monthly_total, (m.l).rent_amount) end asc nulls last,
    case when v_sort = 'recent' then (m.l).availability_confirmed_at end desc nulls last,
    case when v_sort = 'newest' then (m.l).published_at end desc nulls last,
    m.all_yes desc,
    (m.l).availability_confirmed_at desc nulls last,
    (m.l).ref
  limit v_limit offset v_offset;
end $$;
grant execute on function public.search_listings(jsonb) to anon, authenticated;

create or replace function public.get_listing(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l public.listings; v_u public.units; v_p public.properties; v_o public.organizations;
  v_staff boolean; v_viewing_confirmed boolean;
begin
  select * into v_l from public.listings where ref = p_ref;
  if v_l.id is null then return null; end if;
  v_staff := app.can(v_l.property_id, 'manage_listings') or app.is_platform_admin();
  if v_l.status not in ('published', 'let', 'withdrawn', 'paused') and not v_staff then
    return null;
  end if;
  select * into v_u from public.units where id = v_l.unit_id;
  select * into v_p from public.properties where id = v_l.property_id;
  select * into v_o from public.organizations where id = v_l.org_id;
  v_viewing_confirmed := exists (select 1 from public.viewings v where v.listing_id = v_l.id
    and v.tenant_id = auth.uid() and v.status = 'confirmed');

  if v_l.status in ('let', 'withdrawn', 'paused') and not v_staff then
    return jsonb_build_object('ref', v_l.ref, 'status', v_l.status, 'title', v_l.title, 'area', v_p.area,
      'let_on', v_l.let_on, 'layout', v_u.layout, 'bedrooms', v_u.bedrooms, 'rent_amount', v_l.rent_amount);
  end if;

  return jsonb_build_object(
    'id', v_l.id, 'ref', v_l.ref, 'status', v_l.status, 'title', v_l.title, 'description', v_l.description,
    'price_period', v_l.price_period, 'price_basis', v_l.price_basis, 'rent_amount', v_l.rent_amount,
    'deposit_amount', coalesce(v_l.deposit_amount, v_l.deposit_months * v_l.rent_amount),
    'deposit_months', v_l.deposit_months,
    'fixed_monthly_total', v_l.fixed_monthly_total, 'move_in_total', v_l.move_in_total,
    'totals_complete', v_l.totals_complete, 'furnishing', v_l.furnishing, 'student', v_l.student,
    'available_from', v_l.available_from, 'availability_confirmed_at', v_l.availability_confirmed_at,
    'house_rules', v_l.house_rules, 'let_on', v_l.let_on,
    'charges', (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'label', c.label, 'amount', c.amount,
       'frequency', c.frequency, 'billing', c.billing, 'compulsory', c.compulsory) order by c.position), '[]'::jsonb)
       from public.listing_charges c where c.listing_id = v_l.id),
    'unit', jsonb_build_object('layout', v_u.layout, 'rental_scope', v_u.rental_scope, 'bedrooms', v_u.bedrooms,
       'bathrooms', v_u.bathrooms, 'floor_level', v_u.floor_level, 'size_sqm', v_u.size_sqm,
       'building_style', coalesce(v_u.building_style, v_p.building_style), 'origin', v_u.origin,
       'facts', v_u.facts || jsonb_build_object('water_included', app.listing_fact(v_u, v_l, 'water_included'),
                                                'ground_or_lift', app.listing_fact(v_u, v_l, 'ground_or_lift'))),
    'location', jsonb_build_object('area', v_p.area, 'town', v_p.town, 'county', v_p.county, 'road', v_p.road,
       'landmark', v_p.landmark, 'approx_lat', round(v_p.latitude, 2), 'approx_lng', round(v_p.longitude, 2)),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('path', ph.storage_path, 'thumb', ph.thumb_path, 'label', ph.media_label,
       'alt', ph.alt_text, 'width', ph.width, 'height', ph.height) order by ph.is_cover desc, ph.position), '[]'::jsonb)
       from public.listing_photos ph where ph.listing_id = v_l.id),
    'advertiser', jsonb_build_object('name', v_o.name, 'role', v_o.advertiser_role,
       'usually_replies', v_o.usually_replies,
       'identity_checked_at', v_o.identity_checked_at, 'authority_checked_at', v_o.authority_checked_at,
       'property_visited_at', v_p.property_visited_at,
       'call', v_l.contact_call, 'whatsapp', v_l.contact_whatsapp,
       'phone', case when v_l.contact_call or v_l.contact_whatsapp then v_l.contact_phone end),
    -- Directions and meeting instructions only after a confirmed viewing.
    'viewing_instructions', case when v_viewing_confirmed or v_staff then v_l.viewing_instructions end,
    'viewing_address', case when v_viewing_confirmed or v_staff then v_p.viewing_address end,
    'is_staff', v_staff
  );
end $$;
grant execute on function public.get_listing(text) to anon, authenticated;

create or replace function public.log_contact(p_ref text, p_channel text) returns void
language sql security definer set search_path = '' as $$
  insert into public.contact_events (listing_id, user_id, channel)
  select l.id, auth.uid(), p_channel from public.listings l
  where l.ref = p_ref and l.status = 'published' and p_channel in ('call', 'whatsapp')
$$;
grant execute on function public.log_contact(text, text) to anon, authenticated;

create or replace function public.report_listing(p_ref text, p_reason text, p_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_listing uuid; v_admin record;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to report a listing.'); end if;
  select id into v_listing from public.listings where ref = p_ref;
  if v_listing is null then perform app.raise_error('not_found', 'Listing not found.'); end if;
  if (select count(*) from public.listing_reports where reporter_id = auth.uid()
      and created_at > now() - interval '1 day') >= 10 then
    perform app.raise_error('limit', 'You have sent many reports today. Contact support if this is urgent.');
  end if;
  insert into public.listing_reports (listing_id, reporter_id, reason, details)
  values (v_listing, auth.uid(), p_reason, nullif(trim(p_details), '')) returning id into v_id;
  for v_admin in select user_id from public.platform_admins loop
    perform app.notify(v_admin.user_id, null, 'listing_report:' || v_id, 'listing_report',
      'Listing reported', p_ref || ' · ' || replace(p_reason, '_', ' '), '/admin/reports');
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Conversations and viewings
-- ---------------------------------------------------------------------------

create or replace function app.notify_advertiser_team(
  p_property uuid, p_org uuid, p_event text, p_kind text, p_title text, p_body text, p_link text,
  p_assigned uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  for v_user in
    select m.user_id from public.memberships m
    where m.org_id = p_org and m.status = 'active' and m.user_id is not null and m.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
      and (m.role in ('owner', 'agency_admin') or m.id = p_assigned
           or (m.can_manage_listings and (m.all_properties or exists (
                 select 1 from public.membership_properties mp where mp.membership_id = m.id and mp.property_id = p_property))))
  loop
    perform app.notify(v_user, p_org, p_event, p_kind, p_title, p_body, p_link);
  end loop;
end $$;

create or replace function app.ensure_conversation(p_listing uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings; v_id uuid;
begin
  select * into v_l from public.listings where id = p_listing;
  if v_l.id is null or v_l.status <> 'published' then
    perform app.raise_error('listing_unavailable', 'This home is no longer available.');
  end if;
  if app.can(v_l.property_id, 'view') then
    perform app.raise_error('validation', 'You manage this listing, so you cannot enquire about it.');
  end if;
  insert into public.conversations (listing_id, org_id, property_id, tenant_id)
  values (v_l.id, v_l.org_id, v_l.property_id, auth.uid())
  on conflict (listing_id, tenant_id) do nothing;
  select id into v_id from public.conversations where listing_id = v_l.id and tenant_id = auth.uid();
  return v_id;
end $$;

create or replace function app.post_message(p_conversation uuid, p_side text, p_body text, p_client_ref uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_c public.conversations; v_unit text; v_ref text;
begin
  if p_client_ref is not null then
    select id into v_id from public.messages where client_ref = p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.messages (conversation_id, sender_id, sender_side, body, client_ref)
  values (p_conversation, case when p_side = 'system' then null else auth.uid() end, p_side, trim(p_body), p_client_ref)
  returning id into v_id;
  update public.conversations set last_message_at = now(),
    last_tenant_message_at = case when p_side = 'tenant' then now() else last_tenant_message_at end,
    last_advertiser_message_at = case when p_side = 'advertiser' then now() else last_advertiser_message_at end,
    follow_up = case when p_side = 'advertiser' and follow_up = 'new' then 'contacted' else follow_up end
  where id = p_conversation returning * into v_c;

  select u.label, l.ref into v_unit, v_ref from public.listings l join public.units u on u.id = l.unit_id
  where l.id = v_c.listing_id;
  if p_side = 'tenant' then
    perform app.notify_advertiser_team(v_c.property_id, v_c.org_id, 'message:' || v_id, 'message',
      'New message · Unit ' || v_unit, left(trim(p_body), 120),
      '/w/' || v_c.org_id || '/enquiries/' || v_c.id, v_c.assigned_membership_id);
  elsif p_side = 'advertiser' then
    perform app.notify(v_c.tenant_id, null, 'message:' || v_id, 'message', 'New reply about ' || v_ref,
      left(trim(p_body), 120), '/messages/' || v_c.id);
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  return v_id;
end $$;

create or replace function public.start_conversation(p_ref text, p_body text, p_client_ref uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_listing uuid; v_conv uuid;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to message the advertiser.'); end if;
  if length(trim(coalesce(p_body, ''))) < 1 then perform app.raise_error('validation', 'Write a message.'); end if;
  select id into v_listing from public.listings where ref = p_ref;
  v_conv := app.ensure_conversation(v_listing);
  perform app.post_message(v_conv, 'tenant', p_body, p_client_ref);
  return v_conv;
end $$;

create or replace function public.send_message(p_conversation uuid, p_body text, p_client_ref uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_c public.conversations; v_side text;
begin
  select * into v_c from public.conversations where id = p_conversation;
  if v_c.id is null or not app.can_see_conversation(p_conversation) then
    perform app.raise_error('not_found', 'Conversation not found.');
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 then perform app.raise_error('validation', 'Write a message.'); end if;
  v_side := case when v_c.tenant_id = auth.uid() then 'tenant' else 'advertiser' end;
  return app.post_message(p_conversation, v_side, p_body, p_client_ref);
end $$;

create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_see_conversation(p_conversation) then return; end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
end $$;

create or replace function public.set_conversation_follow_up(
  p_conversation uuid, p_stage text default null, p_assign_membership uuid default null, p_unassign boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_c public.conversations;
begin
  select * into v_c from public.conversations where id = p_conversation;
  if v_c.id is null then perform app.raise_error('not_found', 'Conversation not found.'); end if;
  perform app.require(v_c.property_id, 'manage_listings');
  if p_stage is not null and p_stage not in ('new', 'contacted', 'viewing_planned', 'closed') then
    perform app.raise_error('validation', 'Unknown follow-up stage.');
  end if;
  if p_assign_membership is not null and not exists (select 1 from public.memberships m
     where m.id = p_assign_membership and m.org_id = v_c.org_id and m.status = 'active') then
    perform app.raise_error('validation', 'Choose an active team member.');
  end if;
  update public.conversations set follow_up = coalesce(p_stage, follow_up),
    assigned_membership_id = case when p_unassign then null else coalesce(p_assign_membership, assigned_membership_id) end
  where id = p_conversation;
end $$;

create or replace function app.fmt_eat(p timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p at time zone 'Africa/Nairobi', 'Dy DD Mon, HH12:MI AM') || ' EAT'
$$;

create or replace function public.request_viewing(p_ref text, p_start timestamptz, p_note text, p_client_ref uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings; v_conv uuid; v_id uuid;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to request a viewing.'); end if;
  select id into v_id from public.viewings where client_ref = p_client_ref;
  if v_id is not null then return v_id; end if;
  select * into v_l from public.listings where ref = p_ref;
  if p_start is null or p_start < now() + interval '1 hour' then
    perform app.raise_error('validation', 'Choose a time at least an hour from now.');
  end if;
  if p_start > now() + interval '60 days' then
    perform app.raise_error('validation', 'Choose a time within the next 60 days.');
  end if;
  if exists (select 1 from public.viewings v where v.listing_id = v_l.id and v.tenant_id = auth.uid()
             and v.status in ('requested', 'new_time_proposed', 'confirmed')) then
    perform app.raise_error('already_requested', 'You already have a viewing request for this home. Change its time instead.');
  end if;
  v_conv := app.ensure_conversation(v_l.id);
  insert into public.viewings (listing_id, org_id, property_id, conversation_id, tenant_id, requested_start,
                               tenant_note, client_ref, updated_by)
  values (v_l.id, v_l.org_id, v_l.property_id, v_conv, auth.uid(), p_start, nullif(trim(p_note), ''),
          p_client_ref, auth.uid())
  returning id into v_id;
  perform app.post_message(v_conv, 'system', 'Viewing requested · ' || app.fmt_eat(p_start) || ' · not confirmed yet', null);
  perform app.notify_advertiser_team(v_l.property_id, v_l.org_id, 'viewing_requested:' || v_id, 'viewing_requested',
    'Viewing request', 'Requested for ' || app.fmt_eat(p_start), '/w/' || v_l.org_id || '/enquiries?tab=viewings');
  return v_id;
end $$;

-- Advertiser response. A requested viewing is never shown as confirmed until accepted here.
create or replace function public.respond_viewing(
  p_viewing uuid, p_action text, p_time timestamptz default null, p_reason text default null,
  p_instructions text default null, p_ignore_conflict boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_v public.viewings; v_start timestamptz; v_conflict int;
begin
  select * into v_v from public.viewings where id = p_viewing for update;
  if v_v.id is null then perform app.raise_error('not_found', 'Viewing not found.'); end if;
  perform app.require(v_v.property_id, 'manage_listings');
  case p_action
    when 'accept' then
      if v_v.status <> 'requested' then perform app.raise_error('validation', 'This request has already been answered.'); end if;
      v_start := v_v.requested_start;
      select count(*) into v_conflict from public.viewings o
      where o.org_id = v_v.org_id and o.id <> v_v.id and o.status = 'confirmed'
        and abs(extract(epoch from (o.confirmed_start - v_start))) < 45 * 60;
      if v_conflict > 0 and not p_ignore_conflict then
        return jsonb_build_object('ok', false, 'conflict', true,
          'message', 'You have another confirmed viewing within 45 minutes of this time.');
      end if;
      update public.viewings set status = 'confirmed', confirmed_start = v_start,
        meeting_instructions = coalesce(nullif(trim(p_instructions), ''),
          (select l.viewing_instructions from public.listings l where l.id = v_v.listing_id)),
        updated_by = auth.uid() where id = p_viewing;
      update public.conversations set follow_up = 'viewing_planned' where id = v_v.conversation_id and follow_up <> 'closed';
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing confirmed · ' || app.fmt_eat(v_start), null);
      perform app.notify(v_v.tenant_id, null, 'viewing_confirmed:' || v_v.id, 'viewing_confirmed', 'Viewing confirmed',
        app.fmt_eat(v_start), '/viewings');
    when 'propose' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing can no longer be changed.');
      end if;
      if p_time is null or p_time < now() + interval '1 hour' then
        perform app.raise_error('validation', 'Choose a time at least an hour from now.');
      end if;
      update public.viewings set status = 'new_time_proposed', proposed_start = p_time, confirmed_start = null,
        updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'New time proposed · ' || app.fmt_eat(p_time) || ' · waiting for the tenant', null);
      perform app.notify(v_v.tenant_id, null, 'viewing_proposed:' || v_v.id || ':' || extract(epoch from p_time),
        'viewing_proposed', 'New viewing time proposed', app.fmt_eat(p_time), '/viewings');
    when 'decline', 'cancel' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing is already closed.');
      end if;
      if length(trim(coalesce(p_reason, ''))) < 3 then
        perform app.raise_error('reason_required', 'Tell the tenant why, so they can plan.');
      end if;
      update public.viewings set status = case when p_action = 'decline' then 'declined' else 'cancelled' end,
        decline_reason = case when p_action = 'decline' then trim(p_reason) end,
        cancel_reason = case when p_action = 'cancel' then trim(p_reason) end,
        cancelled_by_side = case when p_action = 'cancel' then 'advertiser' end,
        updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system',
        'Viewing ' || case when p_action = 'decline' then 'declined' else 'cancelled' end || ': ' || trim(p_reason), null);
      perform app.notify(v_v.tenant_id, null, 'viewing_' || p_action || ':' || v_v.id, 'viewing_' || p_action,
        'Viewing ' || case when p_action = 'decline' then 'declined' else 'cancelled' end, trim(p_reason), '/viewings');
    when 'attended', 'not_attended', 'unknown' then
      if v_v.status not in ('confirmed', 'attended', 'not_attended', 'unknown') then
        perform app.raise_error('validation', 'Record an outcome only for a confirmed viewing.');
      end if;
      update public.viewings set status = p_action, updated_by = auth.uid() where id = p_viewing;
    else
      perform app.raise_error('validation', 'Unknown action.');
  end case;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.tenant_viewing_action(
  p_viewing uuid, p_action text, p_time timestamptz default null, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_v public.viewings; v_l public.listings;
begin
  select * into v_v from public.viewings where id = p_viewing for update;
  if v_v.id is null or v_v.tenant_id <> auth.uid() then perform app.raise_error('not_found', 'Viewing not found.'); end if;
  select * into v_l from public.listings where id = v_v.listing_id;
  case p_action
    when 'accept_proposed' then
      if v_v.status <> 'new_time_proposed' then perform app.raise_error('validation', 'There is no new time to accept.'); end if;
      update public.viewings set status = 'confirmed', confirmed_start = proposed_start, updated_by = auth.uid(),
        meeting_instructions = coalesce(meeting_instructions, v_l.viewing_instructions) where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing confirmed · ' || app.fmt_eat(v_v.proposed_start), null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_accepted:' || v_v.id || ':' || extract(epoch from now()),
        'viewing_confirmed', 'Tenant accepted the new time', app.fmt_eat(v_v.proposed_start), '/w/' || v_v.org_id || '/viewings');
    when 'change' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing can no longer be changed.');
      end if;
      if p_time is null or p_time < now() + interval '1 hour' then
        perform app.raise_error('validation', 'Choose a time at least an hour from now.');
      end if;
      update public.viewings set status = 'requested', requested_start = p_time, proposed_start = null,
        confirmed_start = null, updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing time change requested · ' || app.fmt_eat(p_time) || ' · not confirmed yet', null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_changed:' || v_v.id || ':' || extract(epoch from p_time),
        'viewing_requested', 'Viewing time change requested', app.fmt_eat(p_time), '/w/' || v_v.org_id || '/enquiries?tab=viewings');
    when 'cancel' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing is already closed.');
      end if;
      update public.viewings set status = 'cancelled', cancelled_by_side = 'tenant',
        cancel_reason = nullif(trim(p_reason), ''), updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing request cancelled by the tenant', null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_cancelled:' || v_v.id, 'viewing_cancelled',
        'Viewing cancelled by tenant', coalesce(nullif(trim(p_reason), ''), 'No reason given'), '/w/' || v_v.org_id || '/viewings');
    else
      perform app.raise_error('validation', 'Unknown action.');
  end case;
end $$;

revoke execute on function public.start_listing(jsonb), public.listing_problems(uuid), public.submit_listing(uuid),
  public.set_listing_status(uuid, text, date), public.confirm_still_available(uuid[]),
  public.report_listing(text, text, text), public.start_conversation(text, text, uuid),
  public.send_message(uuid, text, uuid), public.mark_conversation_read(uuid),
  public.set_conversation_follow_up(uuid, text, uuid, boolean),
  public.request_viewing(text, timestamptz, text, uuid),
  public.respond_viewing(uuid, text, timestamptz, text, text, boolean),
  public.tenant_viewing_action(uuid, text, timestamptz, text) from anon;
