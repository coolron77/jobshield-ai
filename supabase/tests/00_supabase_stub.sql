-- =============================================================================
-- Minimal emulation of the Supabase platform for running the migrations and
-- RLS tests on a plain PostgreSQL server (scripts/test-rls.sh).
-- DO NOT run this against a real Supabase project — it already has these.
-- =============================================================================

-- Roles are cluster-wide, so tolerate them existing from a previous run.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create schema extensions;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Supabase's auth.uid() reads the JWT "sub" claim from request settings.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')),
    ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants these broad defaults on new public tables; the migrations
-- must revoke them. Reproducing them here proves the revokes work.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
