-- =============================================================================
-- JobShield AI — rate limiting, salary benchmarks, admin statistics
-- =============================================================================

-- Private schema: not exposed through the Supabase Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null
);
create index rate_limits_window_idx on private.rate_limits (window_start);

-- Fixed-window rate limiter keyed per user. Parameters are part of the key,
-- so calling it with different limits cannot reset the server's own counter.
-- Returns true when the request is allowed.
create or replace function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_bucket !~ '^[a-z_]{1,40}$' or p_limit not between 1 and 10000 or p_window_seconds not between 1 and 604800 then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;

  v_key := p_bucket || ':' || p_limit || ':' || p_window_seconds || ':' || v_uid;

  insert into private.rate_limits as r (key, window_start, count)
  values (v_key, v_now, 1)
  on conflict (key) do update
    set count = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now then 1 else r.count + 1 end,
        window_start = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now then v_now else r.window_start end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;

-- Housekeeping (schedule with pg_cron if desired): select public.purge_rate_limits();
create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (delete from private.rate_limits where window_start < now() - interval '8 days' returning 1)
  select count(*)::integer from d;
$$;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Salary benchmarks (admin-curated, cited). Empty by default: JobShield never
-- ships invented salary data.
-- ---------------------------------------------------------------------------
create table public.salary_benchmarks (
  id               uuid primary key default gen_random_uuid(),
  role_keyword     text not null check (char_length(role_keyword) between 2 and 80),
  country          text not null check (char_length(country) between 2 and 60),
  currency         text not null check (currency ~ '^[A-Z]{3}$'),
  experience_level text check (experience_level is null or experience_level in ('student', 'fresher', 'junior', 'mid', 'senior')),
  period           text not null check (period in ('month', 'year')),
  min_amount       numeric(14, 2) not null check (min_amount > 0),
  max_amount       numeric(14, 2) not null check (max_amount >= min_amount),
  source_name      text not null check (char_length(source_name) between 2 and 200),
  source_url       text not null check (source_url ~ '^https://' and char_length(source_url) <= 2048),
  retrieved_at     date not null,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index salary_benchmarks_lookup_idx on public.salary_benchmarks (lower(country), currency);

alter table public.salary_benchmarks enable row level security;

create policy "benchmarks: authenticated read"
  on public.salary_benchmarks for select to authenticated using (true);
create policy "benchmarks: admin insert"
  on public.salary_benchmarks for insert to authenticated with check ((select public.is_admin()));
create policy "benchmarks: admin update"
  on public.salary_benchmarks for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "benchmarks: admin delete"
  on public.salary_benchmarks for delete to authenticated using ((select public.is_admin()));

revoke all on table public.salary_benchmarks from anon, authenticated;
grant select, insert, update, delete on table public.salary_benchmarks to authenticated;

-- ---------------------------------------------------------------------------
-- Aggregate statistics for the admin dashboard (counts only, no content).
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can view statistics' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'total_scans', (select count(*) from public.scans),
    'scans_last_7_days', (select count(*) from public.scans where created_at > now() - interval '7 days'),
    'scans_by_level', coalesce((select jsonb_object_agg(risk_level, n) from (select risk_level, count(*) n from public.scans group by risk_level) s), '{}'::jsonb),
    'scans_by_mode', coalesce((select jsonb_object_agg(analysis_mode, n) from (select analysis_mode, count(*) n from public.scans group by analysis_mode) s), '{}'::jsonb),
    'reports_by_status', coalesce((select jsonb_object_agg(moderation_status, n) from (select moderation_status, count(*) n from public.community_reports group by moderation_status) s), '{}'::jsonb),
    'flagged_reports', (select count(*) from public.community_reports where flag_count > 0)
  );
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
