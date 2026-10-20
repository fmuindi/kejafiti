-- IMP-18: context for monthly report review.
--
--   * commentary: the manager's structured note (what changed, unresolved issues, next
--     actions), saved in the finalized version row, so it is part of the immutable record
--     like the snapshot. Versions stay append-only (existing trigger).
--   * report_prefinalize(): what the person is about to freeze - pending entries, corrections
--     touching the period, the previous version's totals and when records last changed.
--   * Finalizing still needs confirm or export permission on the property; no second
--     approval is added.
--
-- Rollback: drop report_prefinalize and the 5-argument finalize_report, restore the
-- 4-argument finalize_report from 20261016000003_rent_workflows.sql, drop column commentary.

alter table public.report_versions add column commentary jsonb
  check (commentary is null or (jsonb_typeof(commentary) = 'object'
    and length(coalesce(commentary ->> 'changes', '')) <= 1500
    and length(coalesce(commentary ->> 'issues', '')) <= 1500
    and length(coalesce(commentary ->> 'next_actions', '')) <= 1500));

drop function public.finalize_report(uuid, date, text, text);

create function public.finalize_report(
  p_property uuid, p_period date, p_notes text, p_change_note text default null, p_commentary jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_version int; v_org uuid; v_id uuid; v_snapshot jsonb; v_commentary jsonb;
begin
  if not (app.can(p_property, 'confirm') or app.can(p_property, 'export')) then
    perform app.raise_error('forbidden', 'You do not have permission to finalize reports for this property.');
  end if;
  select org_id into v_org from public.properties where id = p_property;
  select coalesce(max(version), 0) + 1 into v_version from public.report_versions
  where property_id = p_property and period_start = p_period;
  if v_version > 1 and length(trim(coalesce(p_change_note, ''))) < 3 then
    perform app.raise_error('validation', 'Explain what changed since the previous version.');
  end if;
  -- Keep only the three known sections, trimmed; empty commentary is stored as null.
  v_commentary := jsonb_strip_nulls(jsonb_build_object(
    'changes', nullif(trim(p_commentary ->> 'changes'), ''),
    'issues', nullif(trim(p_commentary ->> 'issues'), ''),
    'next_actions', nullif(trim(p_commentary ->> 'next_actions'), '')));
  if v_commentary = '{}'::jsonb then v_commentary := null; end if;
  v_snapshot := public.build_report(p_property, p_period);
  insert into public.report_versions (org_id, property_id, period_start, version, snapshot, notes,
                                      change_note, prepared_by, commentary)
  values (v_org, p_property, p_period, v_version, v_snapshot, nullif(trim(p_notes), ''),
          nullif(trim(p_change_note), ''), auth.uid(), v_commentary)
  returning id into v_id;
  perform app.audit(v_org, p_property, 'report_finalized', 'report_version', v_id::text,
    jsonb_build_object('period', p_period, 'version', v_version));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;
revoke execute on function public.finalize_report(uuid, date, text, text, jsonb) from public, anon;
grant execute on function public.finalize_report(uuid, date, text, text, jsonb) to authenticated, service_role;

create function public.report_prefinalize(p_property uuid, p_period date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_prev public.report_versions;
begin
  perform app.require(p_property, 'view');
  select * into v_prev from public.report_versions where property_id = p_property and period_start = p_period
  order by version desc limit 1;
  return jsonb_build_object(
    'cut_off', now(),
    'pending_count', (select count(*) from public.payment_entries e where e.property_id = p_property and e.status = 'awaiting_confirmation'),
    'pending_amount', (select coalesce(sum(e.amount), 0) from public.payment_entries e where e.property_id = p_property and e.status = 'awaiting_confirmation'),
    -- Corrections posted against this period's charges (reversal rows are negative).
    'corrections', (select count(*) from public.allocations a join public.rent_charges c on c.id = a.charge_id
                    where c.property_id = p_property and c.period_start = p_period and a.amount < 0),
    'records_changed_at', (select public.records_changed_at(pr.org_id, p_property) from public.properties pr where pr.id = p_property),
    'previous_version', v_prev.version,
    'previous_finalized_at', v_prev.finalized_at,
    'previous_summary', v_prev.snapshot -> 'summary');
end $$;
revoke execute on function public.report_prefinalize(uuid, date) from public, anon;
grant execute on function public.report_prefinalize(uuid, date) to authenticated, service_role;
