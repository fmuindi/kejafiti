-- IMP-13: review checklist items link to the field that fixes them.
--
-- One function now defines every check: app.listing_problem_items returns
-- {code, message, step, field, required}. Required items block submission exactly as
-- before (app.listing_problems, used by submit_listing, is derived from it); suggestions
-- never block. Step numbers are the wizard's: 3 Costs, 4 Photos, 5 Availability.
--
-- Rollback: restore app.listing_problems from 20261016000005_marketplace.sql and drop
-- app.listing_problem_items / public.listing_problem_items.

create function app.listing_problem_items(p_listing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(i order by (i ->> 'required')::boolean desc, (i ->> 'step')::int), '[]'::jsonb)
  from public.listings l
  cross join lateral (values
    (case when l.rent_amount is null then jsonb_build_object('code', 'rent', 'message', 'Enter the rent.', 'step', 3, 'field', 'rent', 'required', true) end),
    (case when l.deposit_amount is null and l.deposit_months is null then jsonb_build_object('code', 'deposit', 'message', 'Enter the deposit, or 0 if there is none.', 'step', 3, 'field', 'deposit', 'required', true) end),
    (case when (select count(*) from public.listing_photos ph where ph.listing_id = l.id) < 4
          then jsonb_build_object('code', 'photos', 'message', 'Add at least 4 photos of this unit.', 'step', 4, 'field', 'photos', 'required', true) end),
    (case when l.available_from is null then jsonb_build_object('code', 'available_from', 'message', 'Enter the date the home is available from.', 'step', 5, 'field', 'available_from', 'required', true) end),
    (case when coalesce(l.title, '') = '' then jsonb_build_object('code', 'title', 'message', 'Add a short title.', 'step', 5, 'field', 'title', 'required', true) end),
    (case when not l.contact_call and not l.contact_whatsapp
          then jsonb_build_object('code', 'contact', 'message', 'Turn on at least one way for tenants to contact you.', 'step', 5, 'field', 'contact', 'required', true) end),
    (case when (l.contact_call or l.contact_whatsapp) and coalesce(l.contact_phone, '') = ''
          then jsonb_build_object('code', 'contact_phone', 'message', 'Enter the phone number tenants should use.', 'step', 5, 'field', 'contact_phone', 'required', true) end),
    -- Suggestions: shown on review, never block submission.
    (case when l.rent_amount is not null and not l.totals_complete
          then jsonb_build_object('code', 'totals', 'message', 'Confirm every compulsory charge so tenants see a complete total.', 'step', 3, 'field', 'rent', 'required', false) end),
    (case when exists (select 1 from public.listing_photos ph where ph.listing_id = l.id and ph.media_label = 'sample')
          then jsonb_build_object('code', 'sample_photos', 'message', 'Replace sample photos with photos of this unit if you can.', 'step', 4, 'field', 'photos', 'required', false) end)
  ) v(i)
  where l.id = p_listing and v.i is not null
$$;

-- Submission keeps using the required items only, as messages (unchanged behaviour).
create or replace function app.listing_problems(p_listing uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(i ->> 'message'), '{}')
  from jsonb_array_elements(app.listing_problem_items(p_listing)) i
  where (i ->> 'required')::boolean
$$;

create function public.listing_problem_items(p_listing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_property uuid;
begin
  select property_id into v_property from public.listings where id = p_listing;
  perform app.require(v_property, 'manage_listings');
  return app.listing_problem_items(p_listing);
end $$;
revoke execute on function public.listing_problem_items(uuid) from public, anon;
grant execute on function public.listing_problem_items(uuid) to authenticated, service_role;
revoke execute on function app.listing_problem_items(uuid) from public, anon;
