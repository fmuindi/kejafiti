-- /api/health calls public.health_check() as an anonymous visitor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

set local role anon;
select is(public.health_check(), true, 'An anonymous caller gets a database round trip');
reset role;
select is((select prosecdef from pg_proc where oid = 'public.health_check()'::regprocedure), false,
  'It runs with the caller''s rights (no SECURITY DEFINER needed)');

select * from finish();
rollback;
