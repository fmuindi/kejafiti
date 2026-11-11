-- Listing another unit in the same building without typing it all again.
--
-- The location already lives on the property, so every unit shares it. What staff used to
-- re-enter for each listing is copied from an earlier listing in the same building (one that got
-- past draft if there is one, else the furthest along, then the latest) when a new
-- listing starts (unless they choose "start blank"):
--   costs:     price period and basis, deposit, every extra charge (service charge, water...);
--   contact:   call / WhatsApp and the number, viewing instructions, house rules;
--   building:  building style and the facts that belong to the building (parking, lift, borehole,
--              backup power, CCTV, pets), filled only where the unit hasn't said yet;
--   rent:      only when the earlier unit is the same kind (layout and bedrooms) and this unit
--              has no rent of its own.
-- Never copied: the unit's own facts (bathroom, meter, kitchen, balcony), the title, the
-- description, availability, or photos of the unit itself. Building photos are copied by the
-- app (storage files can't be copied from SQL). A listing in a building whose location is
-- already filled in opens on the Home step.
--
-- Rollback: alter table public.listings drop column copied_from; restore public.start_listing from
-- 20261016000005_marketplace.sql.

alter table public.listings add column copied_from uuid references public.listings (id) on delete set null;

create or replace function public.start_listing(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (p ->> 'org_id')::uuid;
  v_property uuid := nullif(p ->> 'property_id', '')::uuid;
  v_unit uuid := nullif(p ->> 'unit_id', '')::uuid;
  -- A listing id to copy from, 'none' to start blank, or absent for the latest in the building.
  v_copy text := nullif(p ->> 'copy_from', '');
  v_source public.listings;
  v_listing uuid;
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

  select id into v_listing from public.listings l where l.unit_id = v_unit
    and l.status in ('draft', 'under_review', 'published', 'paused', 'needs_correction') limit 1;
  if v_listing is not null then return v_listing; end if;

  insert into public.listings (org_id, property_id, unit_id, rent_amount, created_by)
  select u.org_id, u.property_id, u.id, u.default_rent, auth.uid() from public.units u where u.id = v_unit
  returning id into v_listing;

  -- What to copy from: the chosen listing (same building only), or the best recent one.
  if v_copy is distinct from 'none' then
    select l.* into v_source from public.listings l
    where l.property_id = v_property and l.id <> v_listing
      and (v_copy is null or l.id = app.safe_uuid(v_copy))
    -- Prefer a listing that got past draft (it is complete), then the most recent.
    order by (l.status <> 'draft') desc, l.wizard_step desc, l.updated_at desc limit 1;
    if v_copy is not null and v_source.id is null then
      perform app.raise_error('validation', 'Choose a listing from this building to copy from.');
    end if;
  end if;

  if v_source.id is not null then
    update public.listings l set
      price_period = v_source.price_period, price_basis = v_source.price_basis,
      deposit_months = v_source.deposit_months, deposit_amount = v_source.deposit_amount,
      furnishing = v_source.furnishing, student = v_source.student,
      contact_call = v_source.contact_call, contact_whatsapp = v_source.contact_whatsapp, contact_phone = v_source.contact_phone,
      viewing_instructions = v_source.viewing_instructions, house_rules = v_source.house_rules,
      rent_amount = coalesce(l.rent_amount, (
        select v_source.rent_amount from public.units su, public.units nu
        where su.id = v_source.unit_id and nu.id = v_unit
          and su.layout = nu.layout and su.bedrooms is not distinct from nu.bedrooms)),
      copied_from = v_source.id
    where l.id = v_listing;
    insert into public.listing_charges (listing_id, kind, label, amount, frequency, billing, compulsory, position)
    select v_listing, c.kind, c.label, c.amount, c.frequency, c.billing, c.compulsory, c.position
    from public.listing_charges c where c.listing_id = v_source.id;
    -- Building facts, only where this unit hasn't answered yet.
    update public.units nu set
      building_style = coalesce(nu.building_style, su.building_style),
      facts = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
               from jsonb_each(coalesce(su.facts, '{}'::jsonb)) f(k, v)
               where k in ('parking', 'lift', 'borehole', 'backup_power', 'cctv', 'pets_allowed') and v <> '"unknown"')
             || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                 from jsonb_each(coalesce(nu.facts, '{}'::jsonb)) f(k, v) where v <> '"unknown"')
    from public.units su
    where su.id = v_source.unit_id and nu.id = v_unit;
  end if;

  -- The building's location is already saved: start on the Home step.
  update public.listings l set wizard_step = 2
  from public.properties pr
  where l.id = v_listing and pr.id = v_property and length(trim(coalesce(pr.area, ''))) >= 2
    and (p ->> 'property_id' is not null or p ->> 'unit_id' is not null);
  return v_listing;
end $$;
