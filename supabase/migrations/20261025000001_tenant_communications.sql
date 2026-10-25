-- Tenant communications: staff with tenancy permission email tenants an invoice for a month,
-- a reminder of what they owe, or a message, one tenant at a time or many at once.
--
-- Every message is kept in tenant_messages with the figures frozen as they were when it was
-- sent (an invoice never changes afterwards), and goes out through the delivery outbox like
-- every other email. A tenant who has online access also sees it in My rent, with an in-app
-- update. Figures come from confirmed records only, the same as the statement.
--
-- A send can include tenants it can't go to; those are skipped with a reason (no email, no
-- charges for the month, nothing owed, already reminded today) and the rest still go.
-- Permission is checked for every tenancy; one the sender can't manage fails the whole send.
--
-- Also: staff can change a tenant's email and phone after setup, and invite several tenants
-- to online access at once (tenant self-view, 20261024000002).
--
-- Rollback: drop trigger delivery_tasks_tenant_message on public.delivery_tasks;
-- drop function app.sync_tenant_message_delivery(), public.send_tenant_messages(jsonb),
-- public.invite_tenants_access(uuid[]), public.update_tenant_contact(uuid, text, text),
-- public.property_tenants(uuid), app.tenancy_charge_lines(uuid), app.tenancy_balance(uuid),
-- app.tenant_email(uuid), app.is_own_tenant(uuid); drop table public.tenant_messages; drop sequence public.invoice_ref_seq.

create sequence public.invoice_ref_seq;

create table public.tenant_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  tenancy_id uuid not null references public.tenancies (id),
  tenant_id uuid not null references public.tenants (id),
  kind text not null check (kind in ('invoice', 'reminder', 'message')),
  -- Invoices only: INV-000123.
  ref text unique,
  subject text not null check (length(trim(subject)) between 1 and 200),
  -- The message, or the sender's note on an invoice or reminder.
  body text check (length(body) <= 5000),
  period_start date check (period_start is null or extract(day from period_start) = 1),
  -- Figures as sent: lines, totals, due date.
  details jsonb not null default '{}'::jsonb,
  email text not null,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'cancelled')),
  delivery_error text,
  client_request_id uuid not null,
  sent_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (client_request_id, tenancy_id),
  check ((kind = 'invoice') = (period_start is not null and ref is not null))
);
create index tenant_messages_tenancy_idx on public.tenant_messages (tenancy_id, created_at desc);
create index tenant_messages_property_idx on public.tenant_messages (property_id, created_at desc);

alter table public.tenant_messages enable row level security;

-- Tenants can no longer read their tenants row (it holds staff notes), so the policy asks here.
create or replace function app.is_own_tenant(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.tenants t where t.id = p_tenant and t.user_id = auth.uid())
$$;

-- Staff who can see the property, and the tenant it was sent to (while they have online access).
-- Written only by send_tenant_messages().
create policy tenant_messages_select on public.tenant_messages for select to authenticated
  using (
    app.can(property_id, 'view')
    or app.is_own_tenant(tenant_id));

-- The address that tenant emails go to: the contact email staff keep, else the address the
-- online-access link went to, else the tenant's own account email.
create or replace function app.tenant_email(p_tenant uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(lower(trim(t.email)), ''), nullif(t.access_email, ''), lower(pr.email))
  from public.tenants t left join public.profiles pr on pr.id = t.user_id
  where t.id = p_tenant
$$;

-- Closing balance of the tenancy statement (confirmed records; positive = owed).
create or replace function app.tenancy_balance(p_tenancy uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.balance
    from public.tenancy_statement(p_tenancy) with ordinality s(line_date, kind, description, charge, payment, balance, ref, n)
    order by s.n desc limit 1), 0)
$$;

-- Each charge with its amount after adjustments and what confirmed payments have covered.
create or replace function app.tenancy_charge_lines(p_tenancy uuid)
returns table (charge_id uuid, category text, period_start date, due_date date, label text, net numeric, paid numeric)
language sql stable security definer set search_path = '' as $$
  select c.id, c.category, c.period_start, c.due_date,
    case when c.category = 'rent' then app.period_label(c.period_start) || ' rent'
         when c.category = 'opening_balance' then 'Balance brought forward'
         else coalesce(nullif(c.description, ''), 'Charge') end,
    c.amount + coalesce((select sum(a.amount) from public.charge_adjustments a where a.charge_id = c.id), 0),
    coalesce((select sum(al.amount) from public.allocations al where al.charge_id = c.id), 0)
  from public.rent_charges c
  where c.tenancy_id = p_tenancy
  order by c.due_date, c.created_at
$$;

-- Tenants of a property, for the Tenants page: contact, online access, balance, last message.
create or replace function public.property_tenants(p_property uuid)
returns table (tenancy_id uuid, status text, start_date date, end_date date, unit_id uuid, unit_label text,
  tenant_id uuid, tenant_name text, email text, phone text, access text, balance numeric,
  last_message_at timestamptz, last_message_kind text)
language sql stable security definer set search_path = '' as $$
  select tc.id, tc.status, tc.start_date, tc.end_date, u.id, u.label, tn.id, tn.full_name,
    app.tenant_email(tn.id), tn.phone,
    case when tn.user_id is not null then 'linked'
         when tn.access_token_hash is not null and tn.access_expires_at > now() then 'invited'
         else 'none' end,
    app.tenancy_balance(tc.id),
    m.created_at, m.kind
  from public.tenancies tc
  join public.tenants tn on tn.id = tc.tenant_id
  join public.units u on u.id = tc.unit_id
  left join lateral (
    select x.created_at, x.kind from public.tenant_messages x
    where x.tenancy_id = tc.id order by x.created_at desc limit 1) m on true
  where tc.property_id = p_property and app.can(p_property, 'view')
  order by tc.status, lower(u.label), tc.start_date desc
$$;

create or replace function public.update_tenant_contact(p_tenant uuid, p_email text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tenants := app.check_tenant_access_manager(p_tenant);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.raise_error('validation', 'Enter the tenant''s email address, like name@example.co.ke.');
  end if;
  if v_email is not null and exists (
      select 1 from public.memberships m join public.profiles pr on pr.id = m.user_id
      where m.org_id = v_t.org_id and m.status in ('active', 'suspended') and lower(pr.email) = v_email) then
    perform app.raise_error('validation', 'That email belongs to someone on your team. Use the tenant''s own email.');
  end if;
  if v_phone is not null and length(v_phone) > 30 then
    perform app.raise_error('validation', 'Enter a phone number of up to 30 characters.');
  end if;
  update public.tenants set email = v_email, phone = v_phone where id = v_t.id;
  perform app.audit(v_t.org_id, null, 'tenant_contact_changed', 'tenant', v_t.id::text,
    jsonb_build_object('email_changed', v_email is distinct from lower(v_t.email), 'phone_changed', v_phone is distinct from v_t.phone));
end $$;

-- Online access for several tenants at once, each to their email on file. Tenants who already
-- have access, have a link waiting, or have no email are skipped and listed.
create or replace function public.invite_tenants_access(p_tenants uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_t public.tenants;
  v_email text;
  v_sent int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
begin
  if p_tenants is null or cardinality(p_tenants) = 0 then
    perform app.raise_error('validation', 'Choose at least one tenant.');
  end if;
  if cardinality(p_tenants) > 200 then
    perform app.raise_error('validation', 'Invite up to 200 tenants at a time.');
  end if;
  -- Permission first, for all of them.
  foreach v_id in array p_tenants loop
    perform app.check_tenant_access_manager(v_id);
  end loop;
  foreach v_id in array (select array_agg(distinct x) from unnest(p_tenants) x) loop
    select * into v_t from public.tenants where id = v_id;
    v_email := app.tenant_email(v_id);
    v_reason := case
      when v_t.user_id is not null then 'linked'
      when v_t.access_token_hash is not null and v_t.access_expires_at > now() then 'invited'
      when v_email is null then 'no_email' end;
    if v_reason is null then
      begin
        perform public.invite_tenant_access(v_id, v_email);
        v_sent := v_sent + 1;
      exception when sqlstate 'P0001' then
        v_reason := 'refused';
        v_skipped := v_skipped || jsonb_build_object('tenant_id', v_id, 'name', v_t.full_name, 'reason', v_reason, 'message', sqlerrm);
        continue;
      end;
    else
      v_skipped := v_skipped || jsonb_build_object('tenant_id', v_id, 'name', v_t.full_name, 'reason', v_reason);
    end if;
  end loop;
  return jsonb_build_object('sent', v_sent, 'skipped', v_skipped);
end $$;

-- p: { client_request_id, kind: invoice | reminder | message, tenancy_ids: [..],
--      period: 'YYYY-MM-01' (invoice), subject (message), body (message, or a note) }
-- Returns { sent: [{ tenancy_id, id, ref }], skipped: [{ tenancy_id, name, unit_label, reason }] }.
-- Retrying with the same client_request_id returns the messages already sent.
create or replace function public.send_tenant_messages(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p ->> 'kind';
  v_req uuid;
  v_period date;
  v_subject text := nullif(trim(coalesce(p ->> 'subject', '')), '');
  v_body text := nullif(trim(coalesce(p ->> 'body', '')), '');
  v_ids uuid[];
  v_id uuid;
  v_tc record;
  v_email text;
  v_sender text;
  v_balance numeric;
  v_lines jsonb;
  v_total numeric;
  v_due date;
  v_details jsonb;
  v_reason text;
  v_subj text;
  v_link text;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_msg public.tenant_messages;
  v_sent jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  if v_kind is null or v_kind not in ('invoice', 'reminder', 'message') then
    perform app.raise_error('validation', 'Choose an invoice, a reminder or a message.');
  end if;
  begin
    v_req := (p ->> 'client_request_id')::uuid;
    v_period := nullif(p ->> 'period', '')::date;
    select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p -> 'tenancy_ids', '[]'::jsonb)) x;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform app.raise_error('validation', 'Something in the request isn''t valid. Reload and try again.');
  end;
  if v_req is null then perform app.raise_error('validation', 'Something in the request isn''t valid. Reload and try again.'); end if;
  if v_ids is null or cardinality(v_ids) = 0 then perform app.raise_error('validation', 'Choose at least one tenant.'); end if;
  if cardinality(v_ids) > 200 then perform app.raise_error('validation', 'Send to up to 200 tenants at a time.'); end if;
  if v_kind = 'invoice' and (v_period is null or extract(day from v_period) <> 1) then
    perform app.raise_error('validation', 'Choose the month to invoice.');
  end if;
  if v_kind = 'message' and (v_subject is null or v_body is null) then
    perform app.raise_error('validation', 'Write a subject and a message.');
  end if;
  if length(v_subject) > 150 then perform app.raise_error('validation', 'Keep the subject to 150 characters.'); end if;
  if length(v_body) > 5000 then perform app.raise_error('validation', 'Keep the message to 5,000 characters.'); end if;

  -- Permission for every tenancy before anything is sent.
  foreach v_id in array v_ids loop
    if not exists (select 1 from public.tenancies t where t.id = v_id and app.can(t.property_id, 'manage_tenancies')) then
      perform app.raise_error('forbidden', 'You need tenancy permission for every tenant you send to.');
    end if;
  end loop;

  select coalesce(nullif(full_name, ''), 'Your landlord') into v_sender from public.profiles where id = auth.uid();

  foreach v_id in array v_ids loop
    select tc.id, tc.org_id, tc.property_id, tc.tenant_id, tn.full_name as tenant_name, tn.user_id as tenant_user,
      u.label as unit_label, pr.name as property_name, o.name as org_name
    into v_tc
    from public.tenancies tc
    join public.tenants tn on tn.id = tc.tenant_id
    join public.units u on u.id = tc.unit_id
    join public.properties pr on pr.id = tc.property_id
    join public.organizations o on o.id = tc.org_id
    where tc.id = v_id;

    select * into v_msg from public.tenant_messages where client_request_id = v_req and tenancy_id = v_id;
    if v_msg.id is not null then
      v_sent := v_sent || jsonb_build_object('tenancy_id', v_id, 'id', v_msg.id, 'ref', v_msg.ref);
      continue;
    end if;

    v_reason := null;
    v_details := '{}'::jsonb;
    v_email := app.tenant_email(v_tc.tenant_id);
    v_balance := app.tenancy_balance(v_id);
    if v_email is null then
      v_reason := 'no_email';
    elsif v_kind = 'invoice' then
      select jsonb_agg(jsonb_build_object('label', l.label, 'amount', l.net, 'due_date', l.due_date) order by l.due_date, l.label),
        sum(l.net), min(l.due_date)
      into v_lines, v_total, v_due
      from app.tenancy_charge_lines(v_id) l where l.period_start = v_period and l.net > 0;
      if v_lines is null then
        v_reason := 'no_charges';
      else
        v_details := jsonb_build_object('period_label', app.period_label(v_period), 'lines', v_lines,
          'period_total', v_total, 'earlier_balance', v_balance - v_total, 'amount_due', greatest(v_balance, 0),
          'credit', greatest(-v_balance, 0), 'due_date', v_due);
      end if;
    elsif v_kind = 'reminder' then
      if v_balance <= 0 then
        v_reason := 'nothing_owed';
      elsif exists (select 1 from public.tenant_messages m where m.tenancy_id = v_id and m.kind = 'reminder'
                    and m.created_at > now() - interval '20 hours') then
        v_reason := 'reminded_recently';
      else
        select jsonb_agg(jsonb_build_object('label', l.label, 'outstanding', l.net - l.paid, 'due_date', l.due_date,
            'overdue', l.due_date < v_today) order by l.due_date, l.label)
        into v_lines
        from app.tenancy_charge_lines(v_id) l where l.net - l.paid > 0;
        v_details := jsonb_build_object('balance', v_balance, 'lines', coalesce(v_lines, '[]'::jsonb), 'as_of', v_today);
      end if;
    end if;

    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_object('tenancy_id', v_id, 'name', v_tc.tenant_name, 'unit_label', v_tc.unit_label, 'reason', v_reason);
      continue;
    end if;

    v_subj := case v_kind
      when 'invoice' then 'Invoice for ' || app.period_label(v_period) || ': ' || v_tc.property_name || ', unit ' || v_tc.unit_label
      when 'reminder' then 'Rent reminder: KSh ' || to_char(v_balance, case when v_balance = trunc(v_balance) then 'FM999,999,999,990' else 'FM999,999,999,990.00' end) || ' due for ' || v_tc.property_name || ', unit ' || v_tc.unit_label
      else v_subject end;

    insert into public.tenant_messages (org_id, property_id, tenancy_id, tenant_id, kind, ref, subject, body, period_start,
      details, email, client_request_id, sent_by)
    values (v_tc.org_id, v_tc.property_id, v_id, v_tc.tenant_id, v_kind,
      case when v_kind = 'invoice' then 'INV-' || lpad(nextval('public.invoice_ref_seq')::text, 6, '0') end,
      v_subj, v_body, case when v_kind = 'invoice' then v_period end, v_details, v_email, v_req, auth.uid())
    returning * into v_msg;

    v_link := case when v_tc.tenant_user is not null then '/my-rent/' || v_id || '/messages/' || v_msg.id end;
    perform app.queue_delivery(v_tc.org_id, 'tenant_message:' || v_msg.id, 'email', v_email, 'tenant_' || v_kind,
      v_details || jsonb_build_object('subject', v_subj, 'body', v_body, 'ref', v_msg.ref, 'org_name', v_tc.org_name,
        'property_name', v_tc.property_name, 'unit_label', v_tc.unit_label, 'name', split_part(v_tc.tenant_name, ' ', 1),
        'sender', v_sender, 'link', v_link));
    -- In-app for a tenant with online access. Inserted directly: the email above is the
    -- message, so app.notify's optional email copy would be a duplicate. A personal update
    -- (no org): the tenant isn't a member of the workspace, and workspace updates are hidden
    -- from non-members. tenancy_* kinds are filed under Rent records.
    if v_tc.tenant_user is not null then
      insert into public.notifications (user_id, org_id, event_key, kind, title, body, link)
      values (v_tc.tenant_user, null, 'tenant_message:' || v_msg.id, 'tenancy_' || v_kind, v_subj,
        'From ' || v_tc.org_name, v_link)
      on conflict (user_id, event_key) do nothing;
    end if;
    perform app.audit(v_tc.org_id, v_tc.property_id, 'tenant_message_sent', 'tenant_message', v_msg.id::text,
      jsonb_build_object('kind', v_kind, 'tenancy_id', v_id, 'ref', v_msg.ref));
    v_sent := v_sent || jsonb_build_object('tenancy_id', v_id, 'id', v_msg.id, 'ref', v_msg.ref);
  end loop;

  return jsonb_build_object('sent', v_sent, 'skipped', v_skipped);
end $$;

-- The message record shows whether its email went: copied from the outbox task.
create or replace function app.sync_tenant_message_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_key like 'tenant_message:%' then
    update public.tenant_messages set delivery_status = new.status, delivery_error = new.last_error
    where id = substr(new.event_key, 16)::uuid;
  end if;
  return new;
end $$;
create trigger delivery_tasks_tenant_message after update of status, last_error on public.delivery_tasks
  for each row when (new.status is distinct from old.status or new.last_error is distinct from old.last_error)
  execute function app.sync_tenant_message_delivery();

revoke execute on function public.send_tenant_messages(jsonb), public.invite_tenants_access(uuid[]),
  public.update_tenant_contact(uuid, text, text), public.property_tenants(uuid) from public, anon;
grant execute on function public.send_tenant_messages(jsonb), public.invite_tenants_access(uuid[]),
  public.update_tenant_contact(uuid, text, text), public.property_tenants(uuid) to authenticated;
revoke execute on function app.tenant_email(uuid), app.tenancy_balance(uuid), app.tenancy_charge_lines(uuid) from public, anon, authenticated;
