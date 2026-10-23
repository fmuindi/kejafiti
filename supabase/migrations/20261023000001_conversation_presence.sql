-- Live status in conversations: online, typing and last active.
--
-- Online and typing travel over a private Realtime channel per conversation ("conv:<id>"),
-- open only to that conversation's participants. Last active is a timestamp per user, written
-- by the app while it is open, and readable only as "the other side of a conversation I'm in".
--
-- Rollback: drop policy conversation_live_read on realtime.messages; drop policy
-- conversation_live_write on realtime.messages; drop function public.conversation_activity(uuid[]);
-- drop function public.touch_activity(); drop function app.conversation_topic_ok(text);
-- drop table public.user_activity;

create table public.user_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;
-- No direct access: written by touch_activity, read through conversation_activity.
revoke all on public.user_activity from anon, authenticated;

-- Called by the app every minute or so while it is open. Writes at most every 30 seconds.
create or replace function public.touch_activity() returns void
language sql security definer set search_path = '' as $$
  insert into public.user_activity (user_id, last_active_at)
  select auth.uid(), now() where auth.uid() is not null
  on conflict (user_id) do update set last_active_at = excluded.last_active_at
  where public.user_activity.last_active_at < now() - interval '30 seconds'
$$;
grant execute on function public.touch_activity() to authenticated;
revoke execute on function public.touch_activity() from anon, public;

-- When the other side of each conversation was last active. For a tenant that is the most
-- recent of the team members who can answer for the listing; for the team it is the tenant.
create or replace function public.conversation_activity(p_ids uuid[])
returns table (conversation_id uuid, last_active_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id,
    case when c.tenant_id = auth.uid() then (
      select max(a.last_active_at)
      from public.memberships m
      join public.user_activity a on a.user_id = m.user_id
      where m.org_id = c.org_id and m.status = 'active'
        and (m.role in ('owner', 'agency_admin')
          or (m.can_manage_listings and (m.all_properties or exists (
            select 1 from public.membership_properties mp where mp.membership_id = m.id and mp.property_id = c.property_id))))
    ) else (
      select a.last_active_at from public.user_activity a where a.user_id = c.tenant_id
    ) end
  from public.conversations c
  where c.id = any (p_ids[1:200]) and app.can_see_conversation(c.id)
$$;
grant execute on function public.conversation_activity(uuid[]) to authenticated;
revoke execute on function public.conversation_activity(uuid[]) from anon, public;

-- Realtime authorization for the private "conv:<id>" channels (presence and typing only).
create or replace function app.conversation_topic_ok(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- case, not and: the id must be checked before it is cast.
  select case when p_topic ~ '^conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then app.can_see_conversation(substr(p_topic, 6)::uuid) else false end
$$;
grant execute on function app.conversation_topic_ok(text) to authenticated;

create policy conversation_live_read on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('presence', 'broadcast') and app.conversation_topic_ok((select realtime.topic())));
create policy conversation_live_write on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('presence', 'broadcast') and app.conversation_topic_ok((select realtime.topic())));
