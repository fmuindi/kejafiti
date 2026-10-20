-- IMP-03: past viewing requests could still be accepted.
--
-- Lifecycle (stored status -> what both sides see):
--   requested            -> "requested" until requested_start, then "expired"
--   new_time_proposed    -> "new_time_proposed" until proposed_start, then "expired"
--   confirmed            -> "confirmed" (after the time, staff record attended / not attended)
--   declined, cancelled, attended, not_attended, unknown -> closed, unchanged
--
-- "expired" is computed from the clock, not written by a job, so tenant and advertiser
-- screens agree at the exact boundary and nothing depends on a scheduler running.
-- Grace policy: none. A request can be accepted only while its time is still in the future.
-- Allowed from expired: advertiser proposes another time or declines; tenant asks for a new
-- time or cancels. Earlier times stay visible in the conversation's system messages.
--
-- Rollback: drop view public.viewing_states, function public.my_viewings,
-- function app.viewing_state, and restore respond_viewing / tenant_viewing_action from
-- 20261016000005_marketplace.sql.

create function app.viewing_state(p_status text, p_requested timestamptz, p_proposed timestamptz)
returns text language sql stable set search_path = '' as $$
  select case
    when p_status = 'requested' and p_requested <= now() then 'expired'
    when p_status = 'new_time_proposed' and p_proposed <= now() then 'expired'
    else p_status
  end
$$;
grant execute on function app.viewing_state(text, timestamptz, timestamptz) to authenticated, service_role;

-- Same rows and RLS as viewings, plus the state everyone should see.
create view public.viewing_states with (security_invoker = true) as
  select v.*, app.viewing_state(v.status, v.requested_start, v.proposed_start) as state
  from public.viewings v;
revoke all on public.viewing_states from anon, public;
grant select on public.viewing_states to authenticated, service_role;

-- Tenant viewings with public listing context (see 20261021000001 for why a function).
create function public.my_viewings()
returns table (id uuid, status text, state text, requested_start timestamptz, proposed_start timestamptz,
  confirmed_start timestamptz, meeting_instructions text, decline_reason text, cancel_reason text,
  conversation_id uuid, listing_ref text, listing_title text, listing_status text, let_on date, area text,
  org_name text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.status, app.viewing_state(v.status, v.requested_start, v.proposed_start),
    v.requested_start, v.proposed_start, v.confirmed_start,
    -- Meeting instructions are shared only once the viewing is confirmed.
    case when v.status = 'confirmed' then v.meeting_instructions end,
    v.decline_reason, v.cancel_reason, v.conversation_id,
    l.ref, l.title, l.status, l.let_on, p.area, o.name
  from public.viewings v
  join public.listings l on l.id = v.listing_id
  join public.properties p on p.id = v.property_id
  join public.organizations o on o.id = v.org_id
  where v.tenant_id = auth.uid()
  order by coalesce(v.confirmed_start, v.proposed_start, v.requested_start) desc
  limit 50
$$;
revoke execute on function public.my_viewings() from public, anon;
grant execute on function public.my_viewings() to authenticated, service_role;

-- Server-side guards. Everything else in these functions is unchanged.
create or replace function public.respond_viewing(
  p_viewing uuid, p_action text, p_time timestamptz default null, p_reason text default null,
  p_instructions text default null, p_ignore_conflict boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_v public.viewings; v_start timestamptz; v_conflict int;
begin
  select * into v_v from public.viewings where id = p_viewing for update;
  if v_v.id is null then perform app.raise_error('not_found', 'Viewing not found.'); end if;
  perform app.require(v_v.property_id, 'manage_listings');
  case p_action
    when 'accept' then
      if v_v.status <> 'requested' then perform app.raise_error('validation', 'This request has already been answered.'); end if;
      if v_v.requested_start <= now() then
        perform app.raise_error('expired', 'The requested time has passed. Suggest another time instead.');
      end if;
      v_start := v_v.requested_start;
      select count(*) into v_conflict from public.viewings o
      where o.org_id = v_v.org_id and o.id <> v_v.id and o.status = 'confirmed'
        and abs(extract(epoch from (o.confirmed_start - v_start))) < 45 * 60;
      if v_conflict > 0 and not p_ignore_conflict then
        return jsonb_build_object('ok', false, 'conflict', true,
          'message', 'You have another confirmed viewing within 45 minutes of this time.');
      end if;
      update public.viewings set status = 'confirmed', confirmed_start = v_start,
        meeting_instructions = coalesce(nullif(trim(p_instructions), ''),
          (select l.viewing_instructions from public.listings l where l.id = v_v.listing_id)),
        updated_by = auth.uid() where id = p_viewing;
      update public.conversations set follow_up = 'viewing_planned' where id = v_v.conversation_id and follow_up <> 'closed';
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing confirmed · ' || app.fmt_eat(v_start), null);
      perform app.notify(v_v.tenant_id, null, 'viewing_confirmed:' || v_v.id, 'viewing_confirmed', 'Viewing confirmed',
        app.fmt_eat(v_start), '/viewings');
    when 'propose' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing can no longer be changed.');
      end if;
      if p_time is null or p_time < now() + interval '1 hour' then
        perform app.raise_error('validation', 'Choose a time at least an hour from now.');
      end if;
      update public.viewings set status = 'new_time_proposed', proposed_start = p_time, confirmed_start = null,
        updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'New time proposed · ' || app.fmt_eat(p_time) || ' · waiting for the tenant', null);
      perform app.notify(v_v.tenant_id, null, 'viewing_proposed:' || v_v.id || ':' || extract(epoch from p_time),
        'viewing_proposed', 'New viewing time proposed', app.fmt_eat(p_time), '/viewings');
    when 'decline', 'cancel' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing is already closed.');
      end if;
      if length(trim(coalesce(p_reason, ''))) < 3 then
        perform app.raise_error('reason_required', 'Tell the tenant why, so they can plan.');
      end if;
      update public.viewings set status = case when p_action = 'decline' then 'declined' else 'cancelled' end,
        decline_reason = case when p_action = 'decline' then trim(p_reason) end,
        cancel_reason = case when p_action = 'cancel' then trim(p_reason) end,
        cancelled_by_side = case when p_action = 'cancel' then 'advertiser' end,
        updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system',
        'Viewing ' || case when p_action = 'decline' then 'declined' else 'cancelled' end || ': ' || trim(p_reason), null);
      perform app.notify(v_v.tenant_id, null, 'viewing_' || p_action || ':' || v_v.id, 'viewing_' || p_action,
        'Viewing ' || case when p_action = 'decline' then 'declined' else 'cancelled' end, trim(p_reason), '/viewings');
    when 'attended', 'not_attended', 'unknown' then
      if v_v.status not in ('confirmed', 'attended', 'not_attended', 'unknown') then
        perform app.raise_error('validation', 'Record an outcome only for a confirmed viewing.');
      end if;
      update public.viewings set status = p_action, updated_by = auth.uid() where id = p_viewing;
    else
      perform app.raise_error('validation', 'Unknown action.');
  end case;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.tenant_viewing_action(
  p_viewing uuid, p_action text, p_time timestamptz default null, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_v public.viewings; v_l public.listings;
begin
  select * into v_v from public.viewings where id = p_viewing for update;
  if v_v.id is null or v_v.tenant_id <> auth.uid() then perform app.raise_error('not_found', 'Viewing not found.'); end if;
  select * into v_l from public.listings where id = v_v.listing_id;
  case p_action
    when 'accept_proposed' then
      if v_v.status <> 'new_time_proposed' then perform app.raise_error('validation', 'There is no new time to accept.'); end if;
      if v_v.proposed_start <= now() then
        perform app.raise_error('expired', 'The suggested time has passed. Ask for a new time instead.');
      end if;
      update public.viewings set status = 'confirmed', confirmed_start = proposed_start, updated_by = auth.uid(),
        meeting_instructions = coalesce(meeting_instructions, v_l.viewing_instructions) where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing confirmed · ' || app.fmt_eat(v_v.proposed_start), null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_accepted:' || v_v.id || ':' || extract(epoch from now()),
        'viewing_confirmed', 'Tenant accepted the new time', app.fmt_eat(v_v.proposed_start), '/w/' || v_v.org_id || '/viewings');
    when 'change' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing can no longer be changed.');
      end if;
      if p_time is null or p_time < now() + interval '1 hour' then
        perform app.raise_error('validation', 'Choose a time at least an hour from now.');
      end if;
      update public.viewings set status = 'requested', requested_start = p_time, proposed_start = null,
        confirmed_start = null, updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing time change requested · ' || app.fmt_eat(p_time) || ' · not confirmed yet', null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_changed:' || v_v.id || ':' || extract(epoch from p_time),
        'viewing_requested', 'Viewing time change requested', app.fmt_eat(p_time), '/w/' || v_v.org_id || '/enquiries?tab=viewings');
    when 'cancel' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing is already closed.');
      end if;
      update public.viewings set status = 'cancelled', cancelled_by_side = 'tenant',
        cancel_reason = nullif(trim(p_reason), ''), updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing request cancelled by the tenant', null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_cancelled:' || v_v.id, 'viewing_cancelled',
        'Viewing cancelled by tenant', coalesce(nullif(trim(p_reason), ''), 'No reason given'), '/w/' || v_v.org_id || '/viewings');
    else
      perform app.raise_error('validation', 'Unknown action.');
  end case;
end $$;
