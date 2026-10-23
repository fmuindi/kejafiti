-- Tenant self-view: a tenant can see their own tenancy, balance and statement online.
--
-- Staff with tenancy permission invite the tenant by email (a one-time link, like team
-- invitations: only a hash is stored, it expires after 7 days, and it must be accepted by the
-- account with that email). Accepting links the tenant record to the account. Staff can
-- remove the link at any time.
--
-- What the tenant sees comes from the existing row-level policies (their charges,
-- adjustments, confirmed payments and allocations) plus my_tenancies() below for the
-- property and unit names. They no longer read their tenants row directly: it holds staff
-- notes written for the team only.
--
-- Rollback: drop function public.my_tenancies(), public.invite_tenant_access(uuid, text),
-- public.tenant_access_preview(text), public.accept_tenant_access(text), public.revoke_tenant_access(uuid);
-- alter table public.tenants drop column access_email, drop column access_token_hash,
-- drop column access_expires_at, drop column access_invited_by; restore tenants_select from
-- 20261016000002_rent_records.sql.

alter table public.tenants
  add column access_email text,
  add column access_token_hash text unique,
  add column access_expires_at timestamptz,
  add column access_invited_by uuid references public.profiles (id);

drop policy tenants_select on public.tenants;
create policy tenants_select on public.tenants for select to authenticated
  using (
    app.is_org_admin(org_id)
    or exists (select 1 from public.tenancies t
               where t.tenant_id = tenants.id and app.can(t.property_id, 'view')));

create or replace function app.check_tenant_access_manager(p_tenant uuid) returns public.tenants
language plpgsql stable security definer set search_path = '' as $$
declare v_t public.tenants;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  select * into v_t from public.tenants where id = p_tenant;
  if v_t.id is null or not (app.is_org_admin(v_t.org_id) or exists (
      select 1 from public.tenancies t where t.tenant_id = v_t.id and app.can(t.property_id, 'manage_tenancies'))) then
    perform app.raise_error('forbidden', 'You need tenancy permission for this property to manage the tenant''s access.');
  end if;
  return v_t;
end $$;

-- Returns the plaintext link token once. Inviting again replaces the previous link.
create or replace function public.invite_tenant_access(p_tenant uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tenants := app.check_tenant_access_manager(p_tenant);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text := app.new_token();
  v_where record;
  v_inviter text;
begin
  if v_t.user_id is not null then
    perform app.raise_error('already_linked', 'This tenant can already see their records online.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.raise_error('validation', 'Enter the tenant''s email address, like name@example.co.ke.');
  end if;
  if exists (select 1 from public.memberships m join public.profiles pr on pr.id = m.user_id
             where m.org_id = v_t.org_id and m.status in ('active', 'suspended') and lower(pr.email) = v_email) then
    perform app.raise_error('validation', 'That email belongs to someone on your team. Use the tenant''s own email.');
  end if;
  update public.tenants set access_email = v_email, access_token_hash = app.hash_token(v_token),
    access_expires_at = now() + interval '7 days', access_invited_by = auth.uid(),
    email = coalesce(nullif(trim(email), ''), v_email)
  where id = v_t.id;

  select o.name as org_name, p.name as property_name, u.label as unit_label into v_where
  from public.tenancies tc join public.units u on u.id = tc.unit_id join public.properties p on p.id = tc.property_id
  join public.organizations o on o.id = tc.org_id
  where tc.tenant_id = v_t.id order by tc.status = 'active' desc, tc.start_date desc limit 1;
  select coalesce(nullif(full_name, ''), 'Your landlord') into v_inviter from public.profiles where id = auth.uid();
  perform app.queue_delivery(v_t.org_id, 'tenant_access:' || v_t.id || ':' || app.hash_token(v_token), 'email', v_email,
    'tenant_access_invitation', jsonb_build_object('org_name', v_where.org_name, 'property_name', v_where.property_name,
      'unit_label', v_where.unit_label, 'inviter', v_inviter, 'name', v_t.full_name, 'token', v_token,
      'expires_at', now() + interval '7 days'));
  perform app.audit(v_t.org_id, null, 'tenant_access_invited', 'tenant', v_t.id::text, jsonb_build_object('email', v_email));
  return jsonb_build_object('token', v_token, 'expires_at', now() + interval '7 days');
end $$;

create or replace function public.revoke_tenant_access(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.tenants := app.check_tenant_access_manager(p_tenant);
begin
  update public.tenants set user_id = null, access_token_hash = null, access_expires_at = null where id = v_t.id;
  perform app.audit(v_t.org_id, null, 'tenant_access_removed', 'tenant', v_t.id::text,
    jsonb_build_object('was_linked', v_t.user_id is not null));
end $$;

create or replace function public.tenant_access_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_t public.tenants; v_where record;
begin
  select * into v_t from public.tenants where access_token_hash = app.hash_token(p_token);
  if v_t.id is null then return jsonb_build_object('state', 'invalid'); end if;
  select o.name as org_name, p.name as property_name, u.label as unit_label into v_where
  from public.tenancies tc join public.units u on u.id = tc.unit_id join public.properties p on p.id = tc.property_id
  join public.organizations o on o.id = tc.org_id
  where tc.tenant_id = v_t.id order by tc.status = 'active' desc, tc.start_date desc limit 1;
  return jsonb_build_object(
    'state', case when v_t.access_expires_at < now() then 'expired' else 'pending' end,
    'org_name', v_where.org_name, 'property_name', v_where.property_name, 'unit_label', v_where.unit_label,
    'name', split_part(v_t.full_name, ' ', 1),
    'email_hint', regexp_replace(v_t.access_email, '^(.).*(@.*)$', '\1•••\2'),
    'expires_at', v_t.access_expires_at);
end $$;
grant execute on function public.tenant_access_preview(text) to anon;

create or replace function public.accept_tenant_access(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_t public.tenants; v_email text;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to see your tenancy.'); end if;
  select * into v_t from public.tenants where access_token_hash = app.hash_token(p_token) for update;
  if v_t.id is null then perform app.raise_error('invalid_invitation', 'This link is not valid. It may have been replaced by a newer one.'); end if;
  if v_t.access_expires_at < now() then
    perform app.raise_error('invitation_expired', 'This link has expired. Ask your landlord or agent for a new one.');
  end if;
  select lower(email) into v_email from public.profiles where id = auth.uid();
  if v_email is distinct from lower(v_t.access_email) then
    perform app.raise_error('wrong_account', 'This link was sent to a different email address. Sign in with that email to open it.');
  end if;
  update public.tenants set user_id = auth.uid(), access_token_hash = null, access_expires_at = null where id = v_t.id;
  perform app.audit(v_t.org_id, null, 'tenant_access_accepted', 'tenant', v_t.id::text, '{}'::jsonb);
  if v_t.access_invited_by is not null then
    perform app.notify(v_t.access_invited_by, v_t.org_id, 'tenancy_access_accepted:' || v_t.id || ':' || floor(extract(epoch from now()))::bigint,
      'tenancy_access_accepted', 'Tenant online access accepted', v_t.full_name || ' can now see their tenancy and statement online.', null);
  end if;
  return v_t.id;
end $$;

-- The signed-in person's own tenancies, with what the statement page needs to label them.
-- Balance is the statement's closing balance (confirmed records only; positive = owed).
create or replace function public.my_tenancies()
returns table (tenancy_id uuid, status text, start_date date, end_date date, due_day int, org_name text,
  property_name text, area text, unit_label text, current_rent numeric, balance numeric)
language sql stable security definer set search_path = '' as $$
  select t.id, t.status, t.start_date, t.end_date, t.due_day, o.name, p.name, p.area, u.label,
    (select r.amount from public.tenancy_rent_rates r where r.tenancy_id = t.id
       and r.effective_from <= (now() at time zone 'Africa/Nairobi')::date order by r.effective_from desc limit 1),
    coalesce((select s.balance from public.tenancy_statement(t.id) with ordinality s(line_date, kind, description, charge, payment, balance, ref, n)
       order by s.n desc limit 1), 0)
  from public.tenancies t
  join public.tenants tn on tn.id = t.tenant_id
  join public.units u on u.id = t.unit_id
  join public.properties p on p.id = t.property_id
  join public.organizations o on o.id = t.org_id
  where tn.user_id = auth.uid() and auth.uid() is not null
  order by t.status = 'active' desc, t.start_date desc
$$;

revoke execute on function public.invite_tenant_access(uuid, text), public.revoke_tenant_access(uuid),
  public.accept_tenant_access(text), public.my_tenancies() from public, anon;
grant execute on function public.invite_tenant_access(uuid, text), public.revoke_tenant_access(uuid),
  public.accept_tenant_access(text), public.my_tenancies() to authenticated;
