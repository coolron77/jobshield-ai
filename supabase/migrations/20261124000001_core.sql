-- =============================================================================
-- JobShield AI — core schema: profiles, scans, saved comparisons
--
-- Security model
--   * Every table has Row Level Security enabled.
--   * Supabase grants broad default privileges to anon/authenticated on new
--     tables in "public"; we revoke them and grant only what each role needs.
--   * Roles are never taken from user metadata or the client. profiles.role
--     can only be changed by the database owner (SQL editor / service role).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text check (display_name is null or char_length(display_name) between 1 and 80),
  role            text not null default 'user' check (role in ('user', 'admin')),
  store_scan_text boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. role is server-controlled; users may only edit display_name and store_scan_text.';
comment on column public.profiles.store_scan_text is 'Privacy control: when false, scan input text is not stored (only a SHA-256 hash and the analysis).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Is the current request made by an admin? SECURITY DEFINER so it can be used
-- inside RLS policies without recursive policy evaluation on profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Create a profile for every new auth user. The role is ALWAYS 'user'; any
-- role supplied in sign-up metadata is ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles: read own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Column-level grant: role, id and timestamps are not updatable by users.
grant update (display_name, store_scan_text) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- scans
-- ---------------------------------------------------------------------------
create table public.scans (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  input_text    text check (input_text is null or char_length(input_text) <= 30000),
  input_sha256  text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_url text check (submitted_url is null or char_length(submitted_url) <= 2048),
  company_name  text check (company_name is null or char_length(company_name) <= 200),
  risk_score    smallint not null check (risk_score between 0 and 100),
  risk_level    text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  summary       text not null check (char_length(summary) <= 2000),
  analysis      jsonb not null check (jsonb_typeof(analysis) = 'object' and pg_column_size(analysis) < 512000),
  analysis_mode text not null check (analysis_mode in ('ai', 'rules_only', 'mock')),
  model         text check (model is null or char_length(model) <= 100),
  created_at    timestamptz not null default now(),
  -- The stored level must match the documented score bands.
  constraint scans_level_matches_score check (
    risk_level = case
      when risk_score >= 75 then 'critical'
      when risk_score >= 50 then 'high'
      when risk_score >= 25 then 'medium'
      else 'low'
    end
  )
);

comment on table public.scans is 'Private job-ad analyses. Visible only to their owner.';
comment on column public.scans.input_text is 'Redacted advertisement text (sensitive identifiers removed before storage). NULL when the owner disabled text storage.';

create index scans_owner_created_idx on public.scans (owner_id, created_at desc);
create index scans_owner_level_idx on public.scans (owner_id, risk_level);

alter table public.scans enable row level security;

create policy "scans: read own"
  on public.scans for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "scans: insert own"
  on public.scans for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "scans: delete own"
  on public.scans for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table public.scans from anon, authenticated;
grant select, insert, delete on table public.scans to authenticated;

-- ---------------------------------------------------------------------------
-- saved_comparisons
-- ---------------------------------------------------------------------------
create table public.saved_comparisons (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scan_a_id  uuid not null references public.scans (id) on delete cascade,
  scan_b_id  uuid not null references public.scans (id) on delete cascade,
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint saved_comparisons_distinct check (scan_a_id <> scan_b_id),
  constraint saved_comparisons_unique unique (owner_id, scan_a_id, scan_b_id)
);

create index saved_comparisons_owner_idx on public.saved_comparisons (owner_id, created_at desc);
create index saved_comparisons_scan_a_idx on public.saved_comparisons (scan_a_id);
create index saved_comparisons_scan_b_idx on public.saved_comparisons (scan_b_id);

alter table public.saved_comparisons enable row level security;

create policy "comparisons: read own"
  on public.saved_comparisons for select to authenticated
  using (owner_id = (select auth.uid()));

-- Both scans must belong to the caller (prevents referencing others' scans).
create policy "comparisons: insert own with own scans"
  on public.saved_comparisons for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.scans s where s.id = scan_a_id and s.owner_id = (select auth.uid()))
    and exists (select 1 from public.scans s where s.id = scan_b_id and s.owner_id = (select auth.uid()))
  );

create policy "comparisons: delete own"
  on public.saved_comparisons for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table public.saved_comparisons from anon, authenticated;
grant select, insert, delete on table public.saved_comparisons to authenticated;
