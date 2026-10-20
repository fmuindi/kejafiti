-- IMP-16: one definition of a person's rent work, used by Team, their overview and their
-- "My entries" list.
--
--   drafts     status 'draft', assigned to them       -> they act (finish and submit)
--   returned   status 'returned', assigned to them    -> they act (correct and resubmit)
--   submitted  status 'awaiting_confirmation', submitted by them -> a manager acts
--
-- Open work (what "You're up to date" depends on) is drafts + returned. Unsent drafts kept
-- only on a device are not in the workspace and are not counted.
--
-- Rollback: restore team_overview from 20261021000006_timestamps.sql; drop
-- app.rent_work_counts and public.my_rent_work.

create function app.rent_work_counts(p_org uuid, p_user uuid)
returns table (drafts int, returned int, submitted int)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where e.status = 'draft' and e.assigned_to = p_user)::int,
    count(*) filter (where e.status = 'returned' and e.assigned_to = p_user)::int,
    count(*) filter (where e.status = 'awaiting_confirmation' and e.submitted_by = p_user)::int
  from public.payment_entries e
  where e.org_id = p_org and (e.assigned_to = p_user or e.submitted_by = p_user)
$$;
revoke execute on function app.rent_work_counts(uuid, uuid) from public, anon;

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
    (select w.submitted from app.rent_work_counts(p_org, m.user_id) w),
    (select w.drafts + w.returned from app.rent_work_counts(p_org, m.user_id) w),
    m.status_changed_at,
    au.last_sign_in_at
  from public.memberships m left join public.profiles pr on pr.id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.org_id = p_org and m.status <> 'removed'
  order by case m.role when 'owner' then 0 when 'agency_admin' then 1 else 2 end, m.status, 3;
end $$;
revoke execute on function public.team_overview(uuid) from public, anon;
grant execute on function public.team_overview(uuid) to authenticated, service_role;

-- The caller's own rent work in one workspace, newest first, with what to do next.
create function public.my_rent_work(p_org uuid)
returns table (entry_id uuid, ref text, grp text, status text, amount numeric, paid_on date, property_id uuid,
  property_name text, unit_label text, tenancy_id uuid, decision_reason text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, e.ref,
    case when e.status = 'returned' then 'returned' when e.status = 'draft' then 'drafts' else 'submitted' end,
    e.status, e.amount, e.paid_on, e.property_id, p.name, u.label, e.tenancy_id, e.decision_reason, e.updated_at
  from public.payment_entries e
  join public.properties p on p.id = e.property_id
  join public.units u on u.id = e.unit_id
  where e.org_id = p_org and auth.uid() is not null
    and ((e.status in ('draft', 'returned') and e.assigned_to = auth.uid())
      or (e.status = 'awaiting_confirmation' and e.submitted_by = auth.uid()))
    -- Still assigned to the property: access removed means the work leaves their list.
    and app.can(e.property_id, 'view')
  order by case e.status when 'returned' then 0 when 'draft' then 1 else 2 end, e.updated_at desc
  limit 200
$$;
revoke execute on function public.my_rent_work(uuid) from public, anon;
grant execute on function public.my_rent_work(uuid) to authenticated, service_role;
