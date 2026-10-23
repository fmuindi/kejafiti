-- Viewing notifications that lead to the action.
--
-- 1. Every notification opens the conversation with the viewing card (#viewing), where the
--    person can accept, suggest another time, reschedule or cancel, instead of a general list.
-- 2. Every action notifies: the other side always, and the rest of the advertiser team when a
--    colleague answers (app.notify_advertiser_team skips the person who acted).
-- 3. Event keys carry the time, so a viewing confirmed, rescheduled and confirmed again
--    notifies each time (before, the repeat hit the (user_id, event_key) unique key and was dropped).
-- 4. Notifications are published to Realtime, so the bell and a pop-up update immediately.
--    Realtime applies notifications_select (own rows only).
--
-- Lifecycle and guards are unchanged from 20261021000002_viewing_expiry.sql.
-- Rollback: restore request_viewing from 20261016000005_marketplace.sql and respond_viewing /
-- tenant_viewing_action from 20261021000002_viewing_expiry.sql; drop function app.viewing_names;
-- alter publication supabase_realtime drop table public.notifications.

-- Names used in notification text: the unit, the tenant, and whoever is acting.
create or replace function app.viewing_names(p_viewing uuid, out unit text, out tenant text, out actor text)
language sql stable security definer set search_path = '' as $$
  select coalesce('Unit ' || u.label, 'the home'),
    coalesce(nullif(trim(tp.full_name), ''), 'The tenant'),
    coalesce((select nullif(trim(m.display_name), '') from public.memberships m
              where m.org_id = v.org_id and m.user_id = auth.uid() and m.status = 'active' limit 1),
             (select nullif(trim(p.full_name), '') from public.profiles p where p.id = auth.uid()), 'A colleague')
  from public.viewings v
  join public.listings l on l.id = v.listing_id
  left join public.units u on u.id = l.unit_id
  left join public.profiles tp on tp.id = v.tenant_id
  where v.id = p_viewing
$$;

create or replace function public.request_viewing(p_ref text, p_start timestamptz, p_note text, p_client_ref uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_l public.listings; v_conv uuid; v_id uuid; v_n record;
begin
  if auth.uid() is null then perform app.raise_error('not_signed_in', 'Sign in to request a viewing.'); end if;
  select id into v_id from public.viewings where client_ref = p_client_ref;
  if v_id is not null then return v_id; end if;
  select * into v_l from public.listings where ref = p_ref;
  if p_start is null or p_start < now() + interval '1 hour' then
    perform app.raise_error('validation', 'Choose a time at least an hour from now.');
  end if;
  if p_start > now() + interval '60 days' then
    perform app.raise_error('validation', 'Choose a time within the next 60 days.');
  end if;
  if exists (select 1 from public.viewings v where v.listing_id = v_l.id and v.tenant_id = auth.uid()
             and v.status in ('requested', 'new_time_proposed', 'confirmed')) then
    perform app.raise_error('already_requested', 'You already have a viewing request for this home. Change its time instead.');
  end if;
  v_conv := app.ensure_conversation(v_l.id);
  insert into public.viewings (listing_id, org_id, property_id, conversation_id, tenant_id, requested_start,
                               tenant_note, client_ref, updated_by)
  values (v_l.id, v_l.org_id, v_l.property_id, v_conv, auth.uid(), p_start, nullif(trim(p_note), ''),
          p_client_ref, auth.uid())
  returning id into v_id;
  perform app.post_message(v_conv, 'system', 'Viewing requested · ' || app.fmt_eat(p_start) || ' · not confirmed yet', null);
  select * into v_n from app.viewing_names(v_id);
  perform app.notify_advertiser_team(v_l.property_id, v_l.org_id, 'viewing_requested:' || v_id, 'viewing_requested',
    'Viewing request · ' || v_n.unit,
    v_n.tenant || ' wants to view it on ' || app.fmt_eat(p_start) || '. Open to accept or suggest another time.',
    '/w/' || v_l.org_id || '/enquiries/' || v_conv || '#viewing');
  return v_id;
end $$;

create or replace function public.respond_viewing(
  p_viewing uuid, p_action text, p_time timestamptz default null, p_reason text default null,
  p_instructions text default null, p_ignore_conflict boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_v public.viewings; v_start timestamptz; v_conflict int; v_n record; v_tenant_link text; v_team_link text; v_stamp text;
begin
  select * into v_v from public.viewings where id = p_viewing for update;
  if v_v.id is null then perform app.raise_error('not_found', 'Viewing not found.'); end if;
  perform app.require(v_v.property_id, 'manage_listings');
  select * into v_n from app.viewing_names(p_viewing);
  v_tenant_link := '/messages/' || v_v.conversation_id || '#viewing';
  v_team_link := '/w/' || v_v.org_id || '/enquiries/' || v_v.conversation_id || '#viewing';
  v_stamp := ':' || extract(epoch from now());
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
      perform app.notify(v_v.tenant_id, null, 'viewing_confirmed:' || v_v.id || v_stamp, 'viewing_confirmed',
        'Viewing request accepted',
        'Your viewing is confirmed for ' || app.fmt_eat(v_start) || '. Open to see where to meet or message the advertiser.', v_tenant_link);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_confirmed_team:' || v_v.id || v_stamp, 'viewing_confirmed',
        'Viewing confirmed · ' || v_n.unit, v_n.actor || ' confirmed ' || v_n.tenant || ' for ' || app.fmt_eat(v_start) || '.', v_team_link);
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
      perform app.notify(v_v.tenant_id, null, 'viewing_proposed:' || v_v.id || v_stamp, 'viewing_proposed',
        case when v_v.status = 'confirmed' then 'Your viewing was rescheduled' else 'New viewing time suggested' end,
        'The advertiser suggests ' || app.fmt_eat(p_time) || '. Open to accept it or ask for another time.', v_tenant_link);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_proposed_team:' || v_v.id || v_stamp, 'viewing_proposed',
        'New time suggested · ' || v_n.unit, v_n.actor || ' suggested ' || app.fmt_eat(p_time) || ' to ' || v_n.tenant || '.', v_team_link);
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
      perform app.notify(v_v.tenant_id, null, 'viewing_' || p_action || ':' || v_v.id || v_stamp, 'viewing_' || p_action,
        'Viewing ' || case when p_action = 'decline' then 'request declined' else 'cancelled' end,
        rtrim(trim(p_reason), '.') || '. Open to message the advertiser or ask for another time.', v_tenant_link);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_' || p_action || '_team:' || v_v.id || v_stamp, 'viewing_' || p_action,
        'Viewing ' || case when p_action = 'decline' then 'declined' else 'cancelled' end || ' · ' || v_n.unit,
        v_n.actor || ' ' || case when p_action = 'decline' then 'declined' else 'cancelled' end || ' ' || v_n.tenant || '''s viewing: ' || trim(p_reason), v_team_link);
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
declare v_v public.viewings; v_l public.listings; v_n record; v_team_link text; v_stamp text;
begin
  select * into v_v from public.viewings where id = p_viewing for update;
  if v_v.id is null or v_v.tenant_id <> auth.uid() then perform app.raise_error('not_found', 'Viewing not found.'); end if;
  select * into v_l from public.listings where id = v_v.listing_id;
  select * into v_n from app.viewing_names(p_viewing);
  v_team_link := '/w/' || v_v.org_id || '/enquiries/' || v_v.conversation_id || '#viewing';
  v_stamp := ':' || extract(epoch from now());
  case p_action
    when 'accept_proposed' then
      if v_v.status <> 'new_time_proposed' then perform app.raise_error('validation', 'There is no new time to accept.'); end if;
      if v_v.proposed_start <= now() then
        perform app.raise_error('expired', 'The suggested time has passed. Ask for a new time instead.');
      end if;
      update public.viewings set status = 'confirmed', confirmed_start = proposed_start, updated_by = auth.uid(),
        meeting_instructions = coalesce(meeting_instructions, v_l.viewing_instructions) where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing confirmed · ' || app.fmt_eat(v_v.proposed_start), null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_accepted:' || v_v.id || v_stamp,
        'viewing_confirmed', 'Viewing confirmed · ' || v_n.unit,
        v_n.tenant || ' accepted ' || app.fmt_eat(v_v.proposed_start) || '.', v_team_link);
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
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_changed:' || v_v.id || v_stamp,
        'viewing_requested', 'Reschedule request · ' || v_n.unit,
        v_n.tenant || ' asks to view on ' || app.fmt_eat(p_time) || ' instead. Open to accept or suggest another time.', v_team_link);
    when 'cancel' then
      if v_v.status not in ('requested', 'new_time_proposed', 'confirmed') then
        perform app.raise_error('validation', 'This viewing is already closed.');
      end if;
      update public.viewings set status = 'cancelled', cancelled_by_side = 'tenant',
        cancel_reason = nullif(trim(p_reason), ''), updated_by = auth.uid() where id = p_viewing;
      perform app.post_message(v_v.conversation_id, 'system', 'Viewing request cancelled by the tenant', null);
      perform app.notify_advertiser_team(v_v.property_id, v_v.org_id, 'viewing_cancelled:' || v_v.id || v_stamp, 'viewing_cancelled',
        'Viewing cancelled · ' || v_n.unit,
        v_n.tenant || ' cancelled. ' || coalesce(nullif(trim(p_reason), ''), 'No reason given.'), v_team_link);
    else
      perform app.raise_error('validation', 'Unknown action.');
  end case;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when duplicate_object then
  null;
end $$;
