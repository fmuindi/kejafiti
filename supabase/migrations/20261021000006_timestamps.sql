-- IMP-15: activity and financial timestamps mean one thing each.
--
--   Last signed in            auth.users.last_sign_in_at (Supabase Auth records it).
--   Last action               memberships.last_active_at, written only by changes to rent
--                             records: saving, submitting, confirming, returning or
--                             correcting payments, creating charges, managing tenancies.
--                             Reading pages never counts.
--   Financial records changed records_changed_at(): the newest posted allocation (confirm
--                             or correction), rent charge or charge adjustment in scope.
--                             Page rendering time is never shown as a data change.
--
-- Rollback: restore team_overview from 20261016000004_team.sql; drop records_changed_at.

drop function public.team_overview(uuid);

create function public.team_overview(p_org uuid)
returns table (membership_id uuid, user_id uuid, display_name text, email text, role text, status text,
  invite_expires_at timestamptz, all_properties boolean, property_names text[], property_ids uuid[],
  can_manage_tenancies boolean, can_enter_payments boolean, can_confirm boolean, can_correct boolean,
  can_export boolean, can_view_attachments boolean, can_manage_listings boolean,
  last_active_at timestamptz, submitted_pending int, open_work int, status_changed_at timestamptz,
  last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_org_admin(p_org) then
    perform app.raise_error('forbidden', 'Only the workspace owner or an agency admin can view the team.');
  end if;
  return query
  select m.id, m.user_id, coalesce(nullif(pr.full_name, ''), m.display_name), coalesce(pr.email, m.invited_email),
    m.role, m.status, m.invite_expires_at, m.all_properties,
    coalesce((select array_agg(p.name order by p.name) from public.membership_properties mp
              join public.properties p on p.id = mp.property_id where mp.membership_id = m.id), '{}'),
    coalesce((select array_agg(mp.property_id) from public.membership_properties mp where mp.membership_id = m.id), '{}'),
    m.can_manage_tenancies, m.can_enter_payments, m.can_confirm, m.can_correct, m.can_export,
    m.can_view_attachments, m.can_manage_listings, m.last_active_at,
    (select count(*)::int from public.payment_entries e where e.org_id = p_org and e.submitted_by = m.user_id
       and e.status = 'awaiting_confirmation'),
    (select count(*)::int from public.payment_entries e where e.org_id = p_org and e.assigned_to = m.user_id
       and e.status in ('draft', 'returned')),
    m.status_changed_at,
    au.last_sign_in_at
  from public.memberships m left join public.profiles pr on pr.id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.org_id = p_org and m.status <> 'removed'
  order by case m.role when 'owner' then 0 when 'agency_admin' then 1 else 2 end, m.status, 3;
end $$;
revoke execute on function public.team_overview(uuid) from public, anon;
grant execute on function public.team_overview(uuid) to authenticated, service_role;

-- When the confirmed financial picture last changed for a property, or for every property
-- the caller can view in the workspace. Null means nothing has been recorded yet.
create function public.records_changed_at(p_org uuid, p_property uuid default null) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_property is not null then
    perform app.require(p_property, 'view');
  end if;
  return (
    with scope as (
      select p.id from public.properties p
      where p.org_id = p_org and (p_property is null or p.id = p_property) and app.can(p.id, 'view'))
    select greatest(
      (select max(a.posted_at) from public.allocations a where a.property_id in (select id from scope)),
      (select max(c.created_at) from public.rent_charges c where c.property_id in (select id from scope)),
      (select max(x.created_at) from public.charge_adjustments x where x.property_id in (select id from scope))));
end $$;
revoke execute on function public.records_changed_at(uuid, uuid) from public, anon;
grant execute on function public.records_changed_at(uuid, uuid) to authenticated, service_role;
