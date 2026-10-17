-- Live message delivery (Realtime honours the messages RLS policy, so only participants
-- receive events) and a tenant-facing conversation list.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception when duplicate_object then
  null;
end $$;

-- Conversations visible to the caller with unread counts. Tenants see their own threads;
-- advertisers see threads for listings they manage.
create or replace function public.my_conversations(p_org uuid default null)
returns table (id uuid, listing_ref text, listing_title text, listing_status text, area text, unit_label text,
  org_name text, tenant_name text, follow_up text, assigned_membership_id uuid, last_message_at timestamptz,
  last_message text, last_side text, unread int, needs_reply boolean, property_id uuid)
language sql stable security invoker set search_path = '' as $$
  select c.id, l.ref, l.title, l.status, p.area, u.label, o.name, tp.full_name, c.follow_up, c.assigned_membership_id,
    c.last_message_at,
    (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select m.sender_side from public.messages m where m.conversation_id = c.id and m.sender_side <> 'system' order by m.created_at desc limit 1),
    (select count(*)::int from public.messages m where m.conversation_id = c.id and m.sender_id is distinct from auth.uid()
       and m.sender_side <> 'system'
       and m.created_at > coalesce((select r.last_read_at from public.conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')),
    c.last_tenant_message_at is not null and (c.last_advertiser_message_at is null or c.last_advertiser_message_at < c.last_tenant_message_at),
    c.property_id
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  join public.units u on u.id = l.unit_id
  join public.properties p on p.id = c.property_id
  join public.organizations o on o.id = c.org_id
  left join public.profiles tp on tp.id = c.tenant_id
  where (p_org is null and c.tenant_id = auth.uid()) or (p_org is not null and c.org_id = p_org)
  order by c.last_message_at desc nulls last
  limit 200
$$;
grant execute on function public.my_conversations(uuid) to authenticated;
revoke execute on function public.my_conversations(uuid) from anon, public;

-- Advertisers may see the name of a tenant who contacted them about a listing they manage.
create or replace function app.is_enquirer_for_me(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.tenant_id = p_user and app.can(c.property_id, 'manage_listings'))
$$;
grant execute on function app.is_enquirer_for_me(uuid) to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.shares_org_with(id) or app.is_platform_admin() or app.is_enquirer_for_me(id));
