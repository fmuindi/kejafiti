-- IMP-01 / IMP-02: tenants lost listing context.
--
-- Root cause: my_conversations ran as SECURITY INVOKER and inner-joined listings, units,
-- properties and organizations. Tenants have no select rights on those tables (they read
-- listings only through search_listings / get_listing), so every row was dropped and the
-- inbox looked empty. The tenant Viewings and Saved pages embedded listings(...) through
-- PostgREST and got null for the same reason, which built /homes/undefined links.
--
-- Fix: SECURITY DEFINER functions that check access explicitly and return only public
-- listing fields (the ones get_listing already shows). Nothing about private addresses,
-- viewing instructions or other tenants is returned.
--
-- Rollback: re-run the previous definition of my_conversations from
-- 20261016000007_realtime_and_tenant_inbox.sql and drop my_viewings / my_saved_listings.

drop function public.my_conversations(uuid);

-- Tenants (p_org null) see their own threads. Staff (p_org set) see threads they may open,
-- the same rule as the conversations RLS policy. Unit labels and tenant names go to staff only.
create function public.my_conversations(p_org uuid default null)
returns table (id uuid, listing_ref text, listing_title text, listing_status text, area text, unit_label text,
  org_name text, advertiser_role text, tenant_name text, follow_up text, assigned_membership_id uuid,
  last_message_at timestamptz, last_message text, last_side text, unread int, needs_reply boolean, property_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, l.ref, l.title, l.status, p.area,
    case when p_org is not null then u.label end,
    o.name, o.advertiser_role,
    case when p_org is not null then tp.full_name end,
    case when p_org is not null then c.follow_up end,
    case when p_org is not null then c.assigned_membership_id end,
    c.last_message_at,
    (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select m.sender_side from public.messages m where m.conversation_id = c.id and m.sender_side <> 'system' order by m.created_at desc limit 1),
    (select count(*)::int from public.messages m where m.conversation_id = c.id and m.sender_id is distinct from auth.uid()
       and m.sender_side <> 'system'
       and m.created_at > coalesce((select r.last_read_at from public.conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')),
    c.last_tenant_message_at is not null and (c.last_advertiser_message_at is null or c.last_advertiser_message_at < c.last_tenant_message_at),
    case when p_org is not null then c.property_id end
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  join public.units u on u.id = l.unit_id
  join public.properties p on p.id = c.property_id
  join public.organizations o on o.id = c.org_id
  left join public.profiles tp on tp.id = c.tenant_id
  where auth.uid() is not null
    and ((p_org is null and c.tenant_id = auth.uid())
      or (p_org is not null and c.org_id = p_org and app.can_see_conversation(c.id)))
  order by c.last_message_at desc nulls last
  limit 200
$$;
revoke execute on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated, service_role;

-- The caller's saved homes with their public listing reference and availability.
create function public.my_saved_listings()
returns table (listing_id uuid, ref text, title text, status text, let_on date, area text, saved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.listing_id, l.ref, l.title, l.status, l.let_on, p.area, s.created_at
  from public.saved_listings s
  join public.listings l on l.id = s.listing_id
  join public.properties p on p.id = l.property_id
  where s.user_id = auth.uid()
  order by s.created_at desc
  limit 200
$$;
revoke execute on function public.my_saved_listings() from public, anon;
grant execute on function public.my_saved_listings() to authenticated, service_role;
