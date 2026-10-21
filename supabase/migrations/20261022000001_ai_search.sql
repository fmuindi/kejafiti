-- AI search (AIS-01/03, AIS-07): the search function gains what typed and spoken requests
-- need, and usage is capped and recorded.
--
--   * budget_basis 'movein': compare the move-in total ("total to move in is 30k"), never
--     monthly rent.
--   * A 'fixed' or 'movein' budget no longer counts a listing whose total is incomplete
--     (a compulsory charge unconfirmed) unless include_unconfirmed is set: an unknown charge
--     doesn't prove the home fits the budget. 'rent' budgets are unchanged.
--   * preferred: features that rank results ("parking would be nice") without filtering.
--   * ai_usage_daily / ai_client_daily and app.ai_take(): per-feature global and per-client
--     daily caps, checked atomically before every provider call; app.ai_record() adds billed
--     units. Service role only. Client keys are salted hashes, never raw IP addresses.
--
-- Rollback: restore search_listings from 20261021000004_cost_definitions.sql; drop the two
-- tables and both functions.

create or replace function public.search_listings(params jsonb)
returns table (ref text, title text, area text, town text, road text, layout text, bedrooms int,
  rental_scope text, building_style text, price_period text, price_basis text, rent_amount numeric,
  fixed_monthly_total numeric, move_in_total numeric, totals_complete boolean, charges jsonb, facts jsonb,
  floor_level int, furnishing text, available_from date, availability_confirmed_at timestamptz,
  advertiser_role text, sponsored boolean, cover_path text, photo_count int, published_at timestamptz,
  unconfirmed_match boolean, approx_lat numeric, approx_lng numeric, distance_km numeric, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(trim(params ->> 'q'), '');
  v_max numeric := nullif(params ->> 'max_rent', '')::numeric;
  v_min numeric := nullif(params ->> 'min_rent', '')::numeric;
  v_basis text := coalesce(params ->> 'budget_basis', 'rent');
  v_types text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(params -> 'home_types') x), '{}');
  v_must text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(params -> 'must_haves') x), '{}');
  -- Preferred features only rank results; they never filter.
  v_prefer text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(params -> 'preferred') x), '{}');
  v_unconf boolean := coalesce((params ->> 'include_unconfirmed')::boolean, false);
  v_furn text := nullif(params ->> 'furnishing', '');
  v_by text := nullif(params ->> 'listed_by', '');
  v_move date := nullif(params ->> 'move_in_by', '')::date;
  v_cat text := nullif(params ->> 'category', '');
  v_sort text := coalesce(params ->> 'sort', 'relevant');
  v_limit int := least(greatest(coalesce((params ->> 'limit')::int, 24), 1), 60);
  v_offset int := greatest(coalesce((params ->> 'offset')::int, 0), 0);
  v_lat numeric := nullif(params ->> 'near_lat', '')::numeric;
  v_lng numeric := nullif(params ->> 'near_lng', '')::numeric;
  v_radius numeric := least(greatest(coalesce(nullif(params ->> 'radius_km', '')::numeric, 5), 0.5), 50);
  v_near boolean;
begin
  v_near := v_lat is not null and v_lng is not null and v_lat between -90 and 90 and v_lng between -180 and 180;
  return query
  with base as (
    select l, u, p, o, d.km as distance
    from public.listings l
    join public.units u on u.id = l.unit_id
    join public.properties p on p.id = l.property_id
    join public.organizations o on o.id = l.org_id
    -- Distance from the same rounded (~1 km) position search already returns, never the exact
    -- one, so varying the radius can't triangulate an address that is private until a viewing.
    cross join lateral (
      select case when v_near and p.latitude is not null and p.longitude is not null then
        round((6371 * 2 * asin(sqrt(
          power(sin(radians(round(p.latitude, 2) - v_lat) / 2), 2) +
          cos(radians(v_lat)) * cos(radians(round(p.latitude, 2))) *
          power(sin(radians(round(p.longitude, 2) - v_lng) / 2), 2))))::numeric, 1)
      end as km
    ) d
    where l.status = 'published'
      -- Near a picked place: homes within the radius, plus homes with no map position whose
      -- text matches the place name. Otherwise plain text search.
      and (case when v_near then d.km <= v_radius
             or (p.latitude is null and v_q is not null
                 and concat_ws(' ', p.area, p.town, p.county, p.road, p.landmark, l.title) ilike '%' || v_q || '%')
           else v_q is null or concat_ws(' ', p.area, p.town, p.county, p.road, p.landmark, l.title) ilike '%' || v_q || '%' end)
      -- Budgets are monthly. Homes priced per week, night or semester are not converted;
      -- they simply aren't compared against a monthly budget (IMP-11).
      -- A total that isn't complete (a compulsory charge unconfirmed) isn't proven to fit a
      -- total budget; it counts only when the tenant includes unconfirmed answers (AI search).
      and (v_max is null or (l.price_period = 'month' and case v_basis
             when 'fixed' then l.fixed_monthly_total <= v_max and (l.totals_complete or v_unconf)
             when 'movein' then l.move_in_total <= v_max and (l.totals_complete or v_unconf)
             else l.rent_amount <= v_max end))
      and (v_min is null or (l.price_period = 'month' and l.rent_amount >= v_min))
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
      coalesce((select bool_and(app.listing_fact(b.u, b.l, k) in ('yes', 'unknown')) from unnest(v_must) k), true) as yes_or_unknown,
      (select count(*) from unnest(v_prefer) k where app.listing_fact(b.u, b.l, k) = 'yes') as pref_score
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
    m.distance,
    count(*) over ()
  from matched m
  order by
    -- Lowest monthly total: monthly-priced homes by their total, then the rest.
    case when v_sort = 'lowest_total' then (m.l).price_period <> 'month' end asc,
    case when v_sort = 'lowest_total' then coalesce((m.l).fixed_monthly_total, (m.l).rent_amount) end asc nulls last,
    case when v_sort = 'recent' then (m.l).availability_confirmed_at end desc nulls last,
    case when v_sort = 'newest' then (m.l).published_at end desc nulls last,
    case when v_sort = 'nearest' then m.distance end asc nulls last,
    m.all_yes desc,
    m.pref_score desc,
    m.distance asc nulls last,
    (m.l).availability_confirmed_at desc nulls last,
    (m.l).ref
  limit v_limit offset v_offset;
end $$;

create table public.ai_usage_daily (
  day date not null,
  feature text not null check (feature in ('search_intent', 'transcribe')),
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  audio_seconds numeric(12, 1) not null default 0,
  failures int not null default 0,
  primary key (day, feature)
);
create table public.ai_client_daily (
  day date not null,
  feature text not null,
  client_hash text not null check (length(client_hash) between 16 and 128),
  requests int not null default 0,
  primary key (day, feature, client_hash)
);
alter table public.ai_usage_daily enable row level security;
alter table public.ai_client_daily enable row level security;
revoke all on public.ai_usage_daily, public.ai_client_daily from anon, authenticated;
-- Admins can read the aggregate (no per-client rows) for monitoring.
create policy ai_usage_admin_read on public.ai_usage_daily for select to authenticated using (app.is_platform_admin());
grant select on public.ai_usage_daily to authenticated;

-- Reserve one request if both caps allow it. Returns 'ok', 'client_limit' or 'global_limit'.
create function app.ai_take(p_feature text, p_client text, p_client_cap int, p_global_cap int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_day date := app.today(); v_client int; v_global int;
begin
  insert into public.ai_usage_daily (day, feature) values (v_day, p_feature) on conflict do nothing;
  select requests into v_global from public.ai_usage_daily where day = v_day and feature = p_feature for update;
  if v_global >= p_global_cap then return 'global_limit'; end if;
  insert into public.ai_client_daily (day, feature, client_hash) values (v_day, p_feature, p_client) on conflict do nothing;
  select requests into v_client from public.ai_client_daily where day = v_day and feature = p_feature and client_hash = p_client for update;
  if v_client >= p_client_cap then return 'client_limit'; end if;
  update public.ai_client_daily set requests = requests + 1 where day = v_day and feature = p_feature and client_hash = p_client;
  update public.ai_usage_daily set requests = requests + 1 where day = v_day and feature = p_feature;
  return 'ok';
end $$;

create function app.ai_record(p_feature text, p_input bigint, p_output bigint, p_audio numeric, p_failed boolean) returns void
language sql security definer set search_path = '' as $$
  update public.ai_usage_daily set input_tokens = input_tokens + coalesce(p_input, 0),
    output_tokens = output_tokens + coalesce(p_output, 0), audio_seconds = audio_seconds + coalesce(p_audio, 0),
    failures = failures + case when p_failed then 1 else 0 end
  where day = app.today() and feature = p_feature
$$;

-- Callable only by the server (service role), through these public wrappers.
create function public.ai_take(p_feature text, p_client text, p_client_cap int, p_global_cap int) returns text
language sql security definer set search_path = '' as $$ select app.ai_take(p_feature, p_client, p_client_cap, p_global_cap) $$;
create function public.ai_record(p_feature text, p_input bigint, p_output bigint, p_audio numeric, p_failed boolean) returns void
language sql security definer set search_path = '' as $$ select app.ai_record(p_feature, p_input, p_output, p_audio, p_failed) $$;
revoke execute on function public.ai_take(text, text, int, int), public.ai_record(text, bigint, bigint, numeric, boolean),
  app.ai_take(text, text, int, int), app.ai_record(text, bigint, bigint, numeric, boolean) from public, anon, authenticated;
grant execute on function public.ai_take(text, text, int, int), public.ai_record(text, bigint, bigint, numeric, boolean) to service_role;
