-- Directions to a confirmed viewing.
--
-- Listings only ever show a position rounded to about 1 km; the exact address is shared once a
-- viewing is confirmed. This is that hand-over: the tenant of a confirmed viewing gets the
-- property's exact position and viewing address, from confirmation until 12 hours after the
-- viewing time. Nobody else gets anything, and nothing is returned before confirmation.
-- The tenant's own live position stays in their browser and is never sent here.
--
-- Rollback: drop function public.viewing_location(uuid);

create or replace function public.viewing_location(p_viewing uuid)
returns table (property_name text, address text, landmark text, latitude numeric, longitude numeric,
  meeting_instructions text, confirmed_start timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.name,
    coalesce(nullif(trim(p.viewing_address), ''),
      nullif(concat_ws(', ', nullif(trim(p.road), ''), nullif(trim(p.area), ''), nullif(trim(p.town), '')), '')),
    nullif(trim(p.landmark), ''),
    p.latitude, p.longitude, v.meeting_instructions, v.confirmed_start
  from public.viewings v
  join public.properties p on p.id = v.property_id
  where v.id = p_viewing
    and v.tenant_id = auth.uid()
    and v.status = 'confirmed'
    and v.confirmed_start > now() - interval '12 hours'
$$;
revoke execute on function public.viewing_location(uuid) from public, anon;
grant execute on function public.viewing_location(uuid) to authenticated;
