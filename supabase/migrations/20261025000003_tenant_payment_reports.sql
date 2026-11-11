-- Tenant-reported missing payments (blueprint v1.0, 25 Oct 2026: pages 4, 7, 11, 16).
--
-- A tenant with online access says "I paid, but it isn't on my statement": amount, date, how
-- they paid and the M-PESA or bank reference. The report is a request to check, never a
-- payment: it doesn't change the balance. The people who confirm payments on the property are
-- told, and it shows in their queue until someone answers it:
--   matched:   it was already recorded; staff link the payment entry (or record it now and the
--              new entry is linked);
--   not_found: staff checked and couldn't find it, and tell the tenant why;
--   withdrawn: the tenant took it back while it was open.
-- The tenant sees the outcome and the staff reply, and the linked payment's progress
-- (being checked / confirmed / not accepted) without seeing staff-only entry details.
--
-- Rollback: drop function public.my_payment_reports(uuid), public.withdraw_payment_report(uuid),
-- public.answer_payment_report(jsonb), public.report_missing_payment(jsonb),
-- app.payment_report_answered(public.payment_reports); drop table public.payment_reports.

create table public.payment_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  tenancy_id uuid not null references public.tenancies (id),
  tenant_id uuid not null references public.tenants (id),
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  method text check (method in ('mpesa', 'bank', 'cash', 'other')),
  reference text check (length(reference) <= 80),
  note text check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'matched', 'not_found', 'withdrawn')),
  entry_id uuid references public.payment_entries (id),
  -- Shown to the tenant.
  reply text check (length(reply) <= 1000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  answered_by uuid references public.profiles (id),
  answered_at timestamptz,
  client_request_id uuid not null unique,
  check ((status = 'matched') = (entry_id is not null)),
  check (status <> 'not_found' or reply is not null)
);
create index payment_reports_tenancy_idx on public.payment_reports (tenancy_id, created_at desc);
create index payment_reports_open_idx on public.payment_reports (org_id, created_at) where status = 'open';

alter table public.payment_reports enable row level security;
-- Staff who can see the property, and the tenant who reported it. Written only by the functions below.
create policy payment_reports_select on public.payment_reports for select to authenticated
  using (app.can(property_id, 'view') or app.is_own_tenant(tenant_id));

-- p: { client_request_id, tenancy_id, amount, paid_on, method?, reference?, note? }
-- Only the tenant on the tenancy, with online access. Retrying the same request returns the same report.
create or replace function public.report_missing_payment(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_req uuid;
  v_tenancy uuid;
  v_amount numeric;
  v_paid date;
  v_method text := nullif(p ->> 'method', '');
  v_ref text := nullif(upper(trim(coalesce(p ->> 'reference', ''))), '');
  v_note text := nullif(trim(coalesce(p ->> 'note', '')), '');
  v_t record;
  v_id uuid;
  v_user uuid;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  begin
    v_req := (p ->> 'client_request_id')::uuid;
    v_tenancy := (p ->> 'tenancy_id')::uuid;
    v_amount := nullif(p ->> 'amount', '')::numeric;
    v_paid := nullif(p ->> 'paid_on', '')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform app.raise_error('validation', 'Something in the report isn''t valid. Check the amount and date.');
  end;
  select id into v_id from public.payment_reports where client_request_id = v_req and created_by = auth.uid();
  if v_id is not null then return v_id; end if;

  select t.id, t.org_id, t.property_id, t.tenant_id, t.start_date, t.end_date, u.label as unit_label, tn.full_name
  into v_t
  from public.tenancies t join public.tenants tn on tn.id = t.tenant_id join public.units u on u.id = t.unit_id
  where t.id = v_tenancy and tn.user_id = auth.uid();
  if v_t.id is null then perform app.raise_error('forbidden', 'You can only report payments for your own tenancy.'); end if;
  if v_req is null then perform app.raise_error('validation', 'Something in the report isn''t valid. Reload and try again.'); end if;
  if v_amount is null or v_amount <= 0 or v_amount > 99999999 or v_amount <> round(v_amount, 2) then
    perform app.raise_error('validation', 'Enter the amount you paid in KSh.');
  end if;
  if v_paid is null then perform app.raise_error('validation', 'Enter the date you paid.'); end if;
  if v_paid > app.today() then perform app.raise_error('validation', 'The date you paid can''t be in the future.'); end if;
  if v_paid < v_t.start_date - 60 or v_paid < app.today() - 730 then
    perform app.raise_error('validation', 'That date is before this tenancy or more than two years ago. Contact your landlord or agent directly.');
  end if;
  if v_method is not null and v_method not in ('mpesa', 'bank', 'cash', 'other') then
    perform app.raise_error('validation', 'Choose how you paid.');
  end if;
  if length(v_ref) > 80 then perform app.raise_error('validation', 'Keep the reference to 80 characters.'); end if;
  if length(v_note) > 1000 then perform app.raise_error('validation', 'Keep the note to 1,000 characters.'); end if;
  if v_ref is not null and exists (select 1 from public.payment_reports r
      where r.tenancy_id = v_t.id and r.status = 'open' and r.reference = v_ref) then
    perform app.raise_error('duplicate', 'You''ve already reported a payment with this reference. It''s being checked.');
  end if;
  if (select count(*) from public.payment_reports r where r.tenancy_id = v_t.id and r.status = 'open') >= 5 then
    perform app.raise_error('too_many', 'You have 5 reports waiting to be checked. Wait for an answer before adding more.');
  end if;

  insert into public.payment_reports (org_id, property_id, tenancy_id, tenant_id, amount, paid_on, method, reference, note,
    created_by, client_request_id)
  values (v_t.org_id, v_t.property_id, v_t.id, v_t.tenant_id, v_amount, v_paid, v_method, v_ref, v_note, auth.uid(), v_req)
  returning id into v_id;
  perform app.audit(v_t.org_id, v_t.property_id, 'payment_reported_by_tenant', 'tenancy', v_t.id::text,
    jsonb_build_object('report', v_id, 'amount', v_amount, 'paid_on', v_paid, 'reference', v_ref));
  -- The people who check receipts on this property, not the whole team.
  for v_user in select app.property_confirmers(v_t.property_id) loop
    perform app.notify(v_user, v_t.org_id, 'payment_report:' || v_id, 'payment_reported',
      'Tenant reports a missing payment',
      'Unit ' || v_t.unit_label || ' · ' || v_t.full_name || ' says they paid ' || app.money(v_amount)
        || ' on ' || to_char(v_paid, 'FMDD Mon') || coalesce(' (' || v_ref || ')', '') || '. Check and answer.',
      (select '/w/' || v_t.org_id || '/rent/' || v_t.property_id || '/units/' || t.unit_id || '#reported'
       from public.tenancies t where t.id = v_t.id));
  end loop;
  return v_id;
end $$;

-- Tell the tenant their report was answered. Reporting needs online access, so the tenant has an
-- account; the in-app update also emails them unless they turned rent emails off.
create or replace function app.payment_report_answered(r public.payment_reports) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_where record;
  v_title text;
  v_body text;
begin
  select tn.user_id, o.name as org_name into v_where
  from public.tenancies t join public.tenants tn on tn.id = t.tenant_id join public.organizations o on o.id = t.org_id
  where t.id = r.tenancy_id;
  v_user := v_where.user_id;
  v_title := case r.status when 'matched' then 'Your payment was found' else 'Your payment couldn''t be found' end;
  v_body := 'The ' || app.money(r.amount) || ' you reported paying on ' || to_char(r.paid_on, 'FMDD Mon YYYY')
    || case r.status
         when 'matched' then ' has been matched to a payment record. It shows on your statement once it''s confirmed.'
         else ' couldn''t be found in ' || v_where.org_name || '''s records.' end
    || coalesce(' "' || r.reply || '"', '');
  if v_user is not null then
    perform app.notify(v_user, null, 'payment_report_answered:' || r.id, 'tenancy_payment_report', v_title, v_body,
      '/my-rent/' || r.tenancy_id || '#reports');
  end if;
end $$;

-- p: { report_id, outcome: 'matched' | 'not_found', entry_id? (matched), reply? (required for not_found) }
-- By anyone who can follow up on the property (enter payments, confirm or manage tenancies).
-- Matching only links the report to an entry on the same tenancy; it never confirms anything.
create or replace function public.answer_payment_report(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.payment_reports;
  v_outcome text := p ->> 'outcome';
  v_entry uuid;
  v_reply text := nullif(trim(coalesce(p ->> 'reply', '')), '');
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  begin
    v_entry := nullif(p ->> 'entry_id', '')::uuid;
    select * into v_r from public.payment_reports where id = (p ->> 'report_id')::uuid for update;
  exception when invalid_text_representation then
    perform app.raise_error('validation', 'This report wasn''t found.');
  end;
  if v_r.id is null or not app.can_follow_up(v_r.property_id) then
    perform app.raise_error('forbidden', 'You need rent or tenancy permission for this property to answer tenant reports.');
  end if;
  if v_r.status = 'withdrawn' then perform app.raise_error('withdrawn', 'The tenant withdrew this report.'); end if;
  if v_r.status <> 'open' then
    -- Already answered: a repeat of the same answer is fine, a different one is not.
    if v_r.status = v_outcome and v_r.entry_id is not distinct from v_entry then return; end if;
    perform app.raise_error('already_answered', 'Someone already answered this report. Reload to see the answer.');
  end if;
  if v_outcome is null or v_outcome not in ('matched', 'not_found') then
    perform app.raise_error('validation', 'Choose whether the payment was found.');
  end if;
  if length(v_reply) > 1000 then perform app.raise_error('validation', 'Keep the reply to 1,000 characters.'); end if;
  if v_outcome = 'not_found' and v_reply is null then
    perform app.raise_error('validation', 'Tell the tenant what you checked, so they know what to send.');
  end if;
  if v_outcome = 'matched' then
    if v_entry is null or not exists (select 1 from public.payment_entries e
        where e.id = v_entry and e.tenancy_id = v_r.tenancy_id and e.status <> 'not_accepted') then
      perform app.raise_error('validation', 'Choose a payment entry for this tenant.');
    end if;
    if exists (select 1 from public.payment_reports r where r.entry_id = v_entry and r.id <> v_r.id) then
      perform app.raise_error('validation', 'That entry already answers another report from this tenant.');
    end if;
  else
    v_entry := null;
  end if;

  update public.payment_reports set status = v_outcome, entry_id = v_entry, reply = v_reply,
    answered_by = auth.uid(), answered_at = now()
  where id = v_r.id
  returning * into v_r;
  perform app.audit(v_r.org_id, v_r.property_id, 'payment_report_answered', 'tenancy', v_r.tenancy_id::text,
    jsonb_build_object('report', v_r.id, 'outcome', v_outcome, 'entry', v_entry));
  perform app.payment_report_answered(v_r);
end $$;

create or replace function public.withdraw_payment_report(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_r public.payment_reports;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to continue.'); end if;
  select * into v_r from public.payment_reports where id = p_id for update;
  if v_r.id is null or not app.is_own_tenant(v_r.tenant_id) then
    perform app.raise_error('forbidden', 'This report wasn''t found.');
  end if;
  if v_r.status = 'withdrawn' then return; end if;
  if v_r.status <> 'open' then perform app.raise_error('already_answered', 'This report has already been answered.'); end if;
  update public.payment_reports set status = 'withdrawn', answered_at = now() where id = p_id;
  perform app.audit(v_r.org_id, v_r.property_id, 'payment_report_withdrawn', 'tenancy', v_r.tenancy_id::text,
    jsonb_build_object('report', p_id));
end $$;

-- The tenant's reports with where the linked payment has got to, without exposing the entry
-- itself (tenants only read confirmed payments).
create or replace function public.my_payment_reports(p_tenancy uuid)
returns table (id uuid, amount numeric, paid_on date, method text, reference text, note text, status text,
  reply text, created_at timestamptz, answered_at timestamptz, payment_state text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.amount, r.paid_on, r.method, r.reference, r.note, r.status, r.reply, r.created_at, r.answered_at,
    case when e.id is null then null
         when e.status = 'confirmed' then 'confirmed'
         when e.status in ('not_accepted', 'reversed') then 'not_accepted'
         else 'checking' end
  from public.payment_reports r
  left join public.payment_entries e on e.id = r.entry_id
  where r.tenancy_id = p_tenancy and app.is_own_tenant(r.tenant_id)
  order by r.created_at desc
  limit 50
$$;

revoke execute on function public.report_missing_payment(jsonb), public.answer_payment_report(jsonb),
  public.withdraw_payment_report(uuid), public.my_payment_reports(uuid) from public, anon;
grant execute on function public.report_missing_payment(jsonb), public.answer_payment_report(jsonb),
  public.withdraw_payment_report(uuid), public.my_payment_reports(uuid) to authenticated;
revoke execute on function app.payment_report_answered(public.payment_reports) from public;
