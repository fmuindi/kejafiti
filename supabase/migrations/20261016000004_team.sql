-- Workspaces and team administration. Only owners and agency admins manage staff; managers
-- cannot grant themselves more authority. The landlord never sees a manager's password:
-- invitees sign in with their own credentials and accept an expiring invitation link.

create or replace function public.create_workspace(
  p_name text, p_kind text, p_advertiser_role text default null, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_name text;
  v_admin record;
  v_role text := coalesce(p_advertiser_role, case when p_kind = 'agency' then 'agent' else 'owner' end);
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  if p_kind not in ('landlord', 'agency') then
    perform app.raise_error('validation', 'Choose landlord or agency.');
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    perform app.raise_error('validation', 'Enter a name for your workspace, for example your name or agency.');
  end if;
  if (select count(*) from public.memberships m where m.user_id = auth.uid() and m.role = 'owner'
        and m.status = 'active') >= 5 then
    perform app.raise_error('limit', 'You already own five workspaces. Contact support to add more.');
  end if;

  insert into public.organizations (name, kind, advertiser_role, contact_phone, created_by)
  values (trim(p_name), p_kind, v_role, nullif(trim(p_phone), ''), auth.uid())
  returning id into v_org;

  select coalesce(nullif(full_name, ''), email, 'Owner') into v_name from public.profiles where id = auth.uid();
  insert into public.memberships (org_id, user_id, role, status, display_name, accepted_at, all_properties,
    can_manage_tenancies, can_enter_payments, can_confirm, can_correct, can_export, can_view_attachments,
    can_manage_listings)
  values (v_org, auth.uid(), 'owner', 'active', v_name, now(), true, true, true, true, true, true, true, true);

  update public.profiles set last_role = 'workspace', last_org_id = v_org where id = auth.uid();
  perform app.audit(v_org, null, 'workspace_created', 'organization', v_org::text,
    jsonb_build_object('kind', p_kind));

  -- Landlord/agent onboarding is a meaningful event even for an existing tenant account.
  for v_admin in select a.user_id, p.email from public.platform_admins a join public.profiles p on p.id = a.user_id loop
    perform app.notify(v_admin.user_id, null, 'onboarding:' || v_org, 'onboarding',
      'New ' || p_kind || ' workspace', trim(p_name) || ' needs onboarding review.', '/admin/onboarding');
    perform app.queue_delivery(null, 'onboarding:' || v_org, 'email', v_admin.email, 'admin_onboarding',
      jsonb_build_object('org_id', v_org, 'name', trim(p_name), 'kind', p_kind));
  end loop;
  return v_org;
end $$;

create or replace function app.check_grant(p_org uuid, p_role text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_org_admin(p_org) then
    perform app.raise_error('forbidden', 'Only the workspace owner or an agency admin can manage staff.');
  end if;
  if p_role not in ('agency_admin', 'manager', 'caretaker', 'viewer') then
    perform app.raise_error('validation', 'Choose a role: property manager, caretaker or view only.');
  end if;
  if p_role = 'agency_admin' and app.org_role(p_org) <> 'owner' then
    perform app.raise_error('forbidden', 'Only the workspace owner can add an agency admin.');
  end if;
end $$;

create or replace function app.apply_access(p_membership uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.memberships;
  v_role text := p ->> 'role';
  v_all boolean := coalesce((p ->> 'all_properties')::boolean, false);
  v_props uuid[];
  v_bad int;
begin
  select * into v_m from public.memberships where id = p_membership;
  select coalesce(array_agg(x::uuid), '{}') into v_props
  from jsonb_array_elements_text(coalesce(p -> 'property_ids', '[]'::jsonb)) x;

  select count(*) into v_bad from unnest(v_props) pid
  where not exists (select 1 from public.properties pr where pr.id = pid and pr.org_id = v_m.org_id);
  if v_bad > 0 then
    perform app.raise_error('validation', 'One of the selected properties is not in this workspace.');
  end if;
  if not v_all and cardinality(v_props) = 0 and v_role <> 'agency_admin' then
    perform app.raise_error('validation', 'Assign at least one property.');
  end if;

  update public.memberships set
    role = v_role,
    all_properties = v_all or v_role = 'agency_admin',
    -- Viewers (e.g. accountants) are read-only unless export is granted.
    can_manage_tenancies = v_role <> 'viewer' and coalesce((p ->> 'can_manage_tenancies')::boolean, false),
    can_enter_payments = v_role <> 'viewer' and coalesce((p ->> 'can_enter_payments')::boolean, false),
    can_confirm = v_role <> 'viewer' and coalesce((p ->> 'can_confirm')::boolean, false),
    can_correct = v_role <> 'viewer' and coalesce((p ->> 'can_correct')::boolean, false),
    can_export = coalesce((p ->> 'can_export')::boolean, false),
    can_view_attachments = coalesce((p ->> 'can_view_attachments')::boolean, false),
    can_manage_listings = v_role <> 'viewer' and coalesce((p ->> 'can_manage_listings')::boolean, false)
  where id = p_membership;

  delete from public.membership_properties where membership_id = p_membership;
  insert into public.membership_properties (membership_id, property_id)
  select p_membership, pid from unnest(v_props) pid;
end $$;

create or replace function app.membership_snapshot(p_membership uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(m) - 'invite_token_hash'
    || jsonb_build_object('property_ids', (select coalesce(jsonb_agg(mp.property_id), '[]'::jsonb)
                                           from public.membership_properties mp where mp.membership_id = m.id))
  from public.memberships m where m.id = p_membership
$$;

-- Returns the plaintext invitation token once. Only its hash is stored.
-- p: {display_name, email, phone?, role, all_properties?, property_ids[], can_* flags}
create or replace function public.invite_member(p_org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p ->> 'email', '')));
  v_token text := app.new_token();
  v_id uuid;
  v_org_name text;
  v_inviter text;
begin
  perform app.check_grant(p_org, p ->> 'role');
  if length(trim(coalesce(p ->> 'display_name', ''))) < 2 then
    perform app.raise_error('validation', 'Enter the person''s full name.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.raise_error('validation', 'Enter an email address for the invitation, like name@example.co.ke.');
  end if;
  if exists (select 1 from public.memberships m join public.profiles pr on pr.id = m.user_id
             where m.org_id = p_org and lower(pr.email) = v_email and m.status in ('active', 'suspended')) then
    perform app.raise_error('already_member', 'This person is already on your team. Edit their access instead.');
  end if;
  if exists (select 1 from public.memberships m where m.org_id = p_org and lower(m.invited_email) = v_email
             and m.status = 'invited') then
    perform app.raise_error('already_invited', 'This email already has a pending invitation. Resend it instead.');
  end if;

  insert into public.memberships (org_id, role, status, display_name, invited_email, invited_phone,
    invite_token_hash, invite_expires_at, invited_by)
  values (p_org, p ->> 'role', 'invited', trim(p ->> 'display_name'), v_email, nullif(trim(p ->> 'phone'), ''),
    app.hash_token(v_token), now() + interval '7 days', auth.uid())
  returning id into v_id;
  perform app.apply_access(v_id, p);

  select name into v_org_name from public.organizations where id = p_org;
  select coalesce(nullif(full_name, ''), 'Your landlord') into v_inviter from public.profiles where id = auth.uid();
  perform app.queue_delivery(p_org, 'invite:' || v_id || ':' || app.hash_token(v_token), 'email', v_email,
    'staff_invitation', jsonb_build_object('membership_id', v_id, 'org_name', v_org_name, 'inviter', v_inviter,
      'name', trim(p ->> 'display_name'), 'token', v_token, 'expires_at', now() + interval '7 days'));
  perform app.audit(p_org, null, 'member_invited', 'membership', v_id::text, app.membership_snapshot(v_id));
  return jsonb_build_object('membership_id', v_id, 'token', v_token, 'expires_at', now() + interval '7 days');
end $$;

create or replace function public.resend_invitation(p_membership uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships; v_token text := app.new_token(); v_org_name text;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if v_m.id is null then perform app.raise_error('not_found', 'Invitation not found.'); end if;
  if not app.is_org_admin(v_m.org_id) then
    perform app.raise_error('forbidden', 'Only the workspace owner or an agency admin can manage staff.');
  end if;
  if v_m.status <> 'invited' then perform app.raise_error('validation', 'This invitation is no longer pending.'); end if;
  update public.memberships set invite_token_hash = app.hash_token(v_token),
    invite_expires_at = now() + interval '7 days' where id = p_membership;
  select name into v_org_name from public.organizations where id = v_m.org_id;
  perform app.queue_delivery(v_m.org_id, 'invite:' || v_m.id || ':' || app.hash_token(v_token), 'email',
    v_m.invited_email, 'staff_invitation', jsonb_build_object('membership_id', v_m.id, 'org_name', v_org_name,
      'name', v_m.display_name, 'token', v_token, 'expires_at', now() + interval '7 days'));
  perform app.audit(v_m.org_id, null, 'invitation_resent', 'membership', v_m.id::text, '{}'::jsonb);
  return jsonb_build_object('membership_id', v_m.id, 'token', v_token, 'expires_at', now() + interval '7 days');
end $$;

create or replace function public.cancel_invitation(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if v_m.id is null then perform app.raise_error('not_found', 'Invitation not found.'); end if;
  if not app.is_org_admin(v_m.org_id) then
    perform app.raise_error('forbidden', 'Only the workspace owner or an agency admin can manage staff.');
  end if;
  if v_m.status <> 'invited' then perform app.raise_error('validation', 'This invitation is no longer pending.'); end if;
  update public.memberships set status = 'removed', invite_token_hash = null, status_changed_at = now(),
    status_changed_by = auth.uid() where id = p_membership;
  update public.delivery_tasks set status = 'cancelled', last_error = 'Invitation cancelled'
  where event_key like 'invite:' || p_membership || ':%' and status = 'queued';
  perform app.audit(v_m.org_id, null, 'invitation_cancelled', 'membership', v_m.id::text, '{}'::jsonb);
end $$;

-- What an invitee sees before accepting (no tenant data, just the workspace and role).
create or replace function public.invitation_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_m public.memberships; v_org text;
begin
  select * into v_m from public.memberships where invite_token_hash = app.hash_token(p_token);
  if v_m.id is null then return jsonb_build_object('state', 'invalid'); end if;
  select name into v_org from public.organizations where id = v_m.org_id;
  return jsonb_build_object(
    'state', case when v_m.status <> 'invited' then 'used'
                  when v_m.invite_expires_at < now() then 'expired' else 'pending' end,
    'org_name', v_org, 'role', v_m.role, 'display_name', v_m.display_name,
    'email_hint', regexp_replace(v_m.invited_email, '^(.).*(@.*)$', '\1•••\2'),
    'expires_at', v_m.invite_expires_at,
    'properties', (select coalesce(jsonb_agg(pr.name order by pr.name), '[]'::jsonb)
                   from public.membership_properties mp join public.properties pr on pr.id = mp.property_id
                   where mp.membership_id = v_m.id),
    'can_confirm', v_m.can_confirm);
end $$;
grant execute on function public.invitation_preview(text) to anon;

-- Attach the membership to the signed-in identity (existing accounts are reused; no
-- duplicate identity is created). The invitation must be for this account's email.
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships; v_email text;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to accept the invitation.'); end if;
  select * into v_m from public.memberships where invite_token_hash = app.hash_token(p_token) for update;
  if v_m.id is null then perform app.raise_error('invalid_invitation', 'This invitation link is not valid.'); end if;
  if v_m.status <> 'invited' then
    perform app.raise_error('invalid_invitation', 'This invitation has already been used or cancelled.');
  end if;
  if v_m.invite_expires_at < now() then
    perform app.raise_error('invitation_expired', 'This invitation has expired. Ask for a new one.');
  end if;
  select lower(email) into v_email from public.profiles where id = auth.uid();
  if v_email is distinct from lower(v_m.invited_email) then
    perform app.raise_error('wrong_account', 'This invitation was sent to a different email address. Sign in with that email to accept it.');
  end if;
  if exists (select 1 from public.memberships m where m.org_id = v_m.org_id and m.user_id = auth.uid()
             and m.status in ('active', 'suspended')) then
    perform app.raise_error('already_member', 'You are already on this team.');
  end if;

  update public.memberships set user_id = auth.uid(), status = 'active', accepted_at = now(),
    invite_token_hash = null, status_changed_at = now(), status_changed_by = auth.uid(),
    last_active_at = now()
  where id = v_m.id;
  update public.profiles set full_name = case when full_name = '' then v_m.display_name else full_name end,
    last_role = 'workspace', last_org_id = v_m.org_id
  where id = auth.uid();
  perform app.audit(v_m.org_id, null, 'invitation_accepted', 'membership', v_m.id::text, '{}'::jsonb);
  if v_m.invited_by is not null then
    perform app.notify(v_m.invited_by, v_m.org_id, 'invite_accepted:' || v_m.id, 'invite_accepted',
      'Invitation accepted', v_m.display_name || ' joined your team.', '/w/' || v_m.org_id || '/team');
  end if;
  return v_m.org_id;
end $$;

create or replace function public.update_member_access(p_membership uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships; v_before jsonb;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if v_m.id is null then perform app.raise_error('not_found', 'Team member not found.'); end if;
  perform app.check_grant(v_m.org_id, p ->> 'role');
  if v_m.role = 'owner' then perform app.raise_error('forbidden', 'The owner''s access cannot be changed here.'); end if;
  if v_m.user_id = auth.uid() then perform app.raise_error('forbidden', 'You cannot change your own access.'); end if;
  if v_m.status = 'removed' then perform app.raise_error('validation', 'This person has been removed.'); end if;
  v_before := app.membership_snapshot(p_membership);
  perform app.apply_access(p_membership, p);
  perform app.audit(v_m.org_id, null, 'member_access_changed', 'membership', v_m.id::text,
    jsonb_build_object('before', v_before, 'after', app.membership_snapshot(p_membership)));
  if v_m.user_id is not null then
    perform app.notify(v_m.user_id, v_m.org_id, 'access_changed:' || v_m.id || ':' || extract(epoch from now()),
      'access_changed', 'Your access changed', 'Your properties or permissions were updated.', '/w/' || v_m.org_id);
  end if;
end $$;

-- Moves open work (drafts and returned entries, assigned enquiries) to another active
-- member. Entries awaiting confirmation stay in the property inbox for any confirmer.
create or replace function app.reassign_work(p_from uuid, p_org uuid, p_to_membership uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_to uuid; v_count int := 0; v_e record;
begin
  if p_to_membership is null then return 0; end if;
  select user_id into v_to from public.memberships
  where id = p_to_membership and org_id = p_org and status = 'active';
  if v_to is null then
    perform app.raise_error('validation', 'Choose an active team member to take over open work.');
  end if;
  for v_e in select id from public.payment_entries
             where org_id = p_org and assigned_to = p_from and status in ('draft', 'returned') loop
    update public.payment_entries set assigned_to = v_to where id = v_e.id;
    perform app.entry_event(v_e.id, 'reassigned', null, jsonb_build_object('from', p_from, 'to', v_to));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.set_member_status(
  p_membership uuid, p_status text, p_reassign_to uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships; v_moved int := 0;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if v_m.id is null then perform app.raise_error('not_found', 'Team member not found.'); end if;
  if not app.is_org_admin(v_m.org_id) then
    perform app.raise_error('forbidden', 'Only the workspace owner or an agency admin can manage staff.');
  end if;
  if v_m.role = 'owner' then perform app.raise_error('forbidden', 'The owner cannot be suspended or removed.'); end if;
  if v_m.user_id = auth.uid() then perform app.raise_error('forbidden', 'You cannot change your own access.'); end if;
  if v_m.role = 'agency_admin' and app.org_role(v_m.org_id) <> 'owner' then
    perform app.raise_error('forbidden', 'Only the owner can change an agency admin''s access.');
  end if;
  if p_status not in ('active', 'suspended', 'removed') then
    perform app.raise_error('validation', 'Unknown status.');
  end if;
  if v_m.status = 'removed' then perform app.raise_error('validation', 'This person has already been removed.'); end if;
  if v_m.status = 'invited' then perform app.raise_error('validation', 'Cancel the invitation instead.'); end if;
  if p_status = v_m.status then return jsonb_build_object('moved', 0); end if;

  update public.memberships set status = p_status, status_changed_at = now(), status_changed_by = auth.uid()
  where id = p_membership;
  if p_status in ('suspended', 'removed') then
    v_moved := app.reassign_work(v_m.user_id, v_m.org_id, p_reassign_to);
    update public.conversations c set assigned_membership_id = p_reassign_to
    where c.assigned_membership_id = p_membership;
  end if;
  perform app.audit(v_m.org_id, null, 'member_' || p_status, 'membership', v_m.id::text,
    jsonb_build_object('reassigned_to', p_reassign_to, 'moved', v_moved));
  perform app.notify(v_m.user_id, v_m.org_id, 'member_status:' || v_m.id || ':' || extract(epoch from now()),
    'access_changed',
    case p_status when 'active' then 'Your access was restored' when 'suspended' then 'Your access was suspended'
                  else 'You were removed from a team' end,
    (select name from public.organizations where id = v_m.org_id), null);
  return jsonb_build_object('moved', v_moved);
end $$;

-- Team list for admins, with pending work counts.
create or replace function public.team_overview(p_org uuid)
returns table (membership_id uuid, user_id uuid, display_name text, email text, role text, status text,
  invite_expires_at timestamptz, all_properties boolean, property_names text[], property_ids uuid[],
  can_manage_tenancies boolean, can_enter_payments boolean, can_confirm boolean, can_correct boolean,
  can_export boolean, can_view_attachments boolean, can_manage_listings boolean,
  last_active_at timestamptz, submitted_pending int, open_work int, status_changed_at timestamptz)
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
    m.status_changed_at
  from public.memberships m left join public.profiles pr on pr.id = m.user_id
  where m.org_id = p_org and m.status <> 'removed'
  order by case m.role when 'owner' then 0 when 'agency_admin' then 1 else 2 end, m.status, 3;
end $$;

-- The signed-in user's workspaces and effective permissions (for navigation).
create or replace function public.my_workspaces()
returns table (org_id uuid, org_name text, kind text, role text, all_properties boolean,
  can_manage_tenancies boolean, can_enter_payments boolean, can_confirm boolean, can_correct boolean,
  can_export boolean, can_view_attachments boolean, can_manage_listings boolean, property_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.kind, m.role, m.all_properties or m.role in ('owner', 'agency_admin'),
    m.can_manage_tenancies or m.role in ('owner', 'agency_admin'),
    m.can_enter_payments or m.role in ('owner', 'agency_admin'),
    m.can_confirm or m.role in ('owner', 'agency_admin'),
    m.can_correct or m.role in ('owner', 'agency_admin'),
    m.can_export or m.role in ('owner', 'agency_admin'),
    m.can_view_attachments or m.role in ('owner', 'agency_admin'),
    m.can_manage_listings or m.role in ('owner', 'agency_admin'),
    coalesce((select array_agg(mp.property_id) from public.membership_properties mp where mp.membership_id = m.id), '{}')
  from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by o.name
$$;

revoke execute on function public.create_workspace(text, text, text, text), public.invite_member(uuid, jsonb),
  public.resend_invitation(uuid), public.cancel_invitation(uuid), public.accept_invitation(text),
  public.update_member_access(uuid, jsonb), public.set_member_status(uuid, text, uuid),
  public.team_overview(uuid), public.my_workspaces() from anon;
