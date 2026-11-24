-- =============================================================================
-- Row Level Security isolation tests.
-- Run with scripts/test-rls.sh (plain Postgres + stub) or against a local
-- Supabase database:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Every check raises an exception on failure; the script stops at the first one.
-- All changes are made inside a transaction that is rolled back at the end.
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

begin;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create or replace function tests.fails(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (% %)', msg, sqlstate, sqlerrm;
    return;
  end;
  raise exception 'FAIL: expected an error: %', msg;
end $$;

create or replace function tests.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create table tests.ids (name text primary key, id uuid not null);
grant all on tests.ids to anon, authenticated;
create or replace function tests.id(n text) returns uuid language sql stable as $$ select id from tests.ids where name = n $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@test.local', '{"display_name":"Alice","role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'carol@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000d4', 'dave@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local', '{}');

select tests.ok((select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'user',
  'sign-up metadata cannot grant the admin role');
select tests.ok((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'Alice',
  'profile is created by trigger with display name');

-- Promote the admin the only supported way: as the database owner.
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

-- ---------------------------------------------------------------- scans
set local role authenticated;
select tests.as_user('00000000-0000-0000-0000-0000000000a1');

insert into public.scans (id, title, input_sha256, risk_score, risk_level, summary, analysis, analysis_mode)
values
  ('10000000-0000-0000-0000-000000000001', 'Alice scan 1', repeat('a', 64), 80, 'critical', 's', '{"version":1}', 'rules_only'),
  ('10000000-0000-0000-0000-000000000002', 'Alice scan 2', repeat('b', 64), 10, 'low', 's', '{"version":1}', 'ai');

select tests.ok((select count(*) from public.scans) = 2, 'alice sees her own 2 scans');
select tests.ok((select owner_id from public.scans limit 1) = '00000000-0000-0000-0000-0000000000a1', 'owner_id defaults to auth.uid()');
select tests.fails($$insert into public.scans (title, input_sha256, risk_score, risk_level, summary, analysis, analysis_mode)
  values ('bad', repeat('c', 64), 80, 'low', 's', '{}', 'ai')$$, 'risk_level must match the score band');
select tests.fails($$update public.scans set risk_score = 0, risk_level = 'low'$$, 'scans are immutable (no UPDATE privilege)');

select tests.as_user('00000000-0000-0000-0000-0000000000b2');
select tests.ok((select count(*) from public.scans) = 0, 'bob cannot see alice''s scans');
select tests.ok((select count(*) from public.scans where id = '10000000-0000-0000-0000-000000000001') = 0, 'bob cannot fetch alice''s scan by id (no IDOR)');
delete from public.scans where id = '10000000-0000-0000-0000-000000000001';
select tests.fails($$insert into public.scans (owner_id, title, input_sha256, risk_score, risk_level, summary, analysis, analysis_mode)
  values ('00000000-0000-0000-0000-0000000000a1', 'forged', repeat('d', 64), 0, 'low', 's', '{}', 'ai')$$, 'bob cannot insert a scan owned by alice');
insert into public.scans (id, title, input_sha256, risk_score, risk_level, summary, analysis, analysis_mode)
values ('20000000-0000-0000-0000-000000000001', 'Bob scan', repeat('e', 64), 30, 'medium', 's', '{"version":1}', 'ai');

reset role;
select tests.ok((select count(*) from public.scans where id = '10000000-0000-0000-0000-000000000001') = 1, 'bob''s delete of alice''s scan affected nothing');
set local role authenticated;

-- ---------------------------------------------------------------- anon
set local role anon;
select tests.as_user(null);
select tests.fails($$select * from public.scans$$, 'anon cannot read scans');
select tests.fails($$select * from public.profiles$$, 'anon cannot read profiles');
select tests.fails($$select * from public.community_reports$$, 'anon cannot read the community_reports table');
select tests.ok((select count(*) from public.public_community_reports) = 0, 'anon sees no unapproved reports');
select tests.fails($$select public.check_rate_limit('scan', 5, 60)$$, 'anon cannot use the rate limiter');
set local role authenticated;

-- ---------------------------------------------------------------- profiles
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
update public.profiles set display_name = 'Alice A.' where id = '00000000-0000-0000-0000-0000000000a1';
select tests.ok((select display_name from public.profiles) = 'Alice A.', 'alice can update her display name');
select tests.fails($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1'$$, 'alice cannot change her own role');
update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000b2';
select tests.ok((select count(*) from public.profiles) = 1, 'alice only sees her own profile');
select tests.ok(public.is_admin() = false, 'alice is not an admin');

-- ---------------------------------------------------------------- comparisons
insert into public.saved_comparisons (scan_a_id, scan_b_id)
values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
select tests.ok((select count(*) from public.saved_comparisons) = 1, 'alice saves a comparison of her own scans');
select tests.fails($$insert into public.saved_comparisons (scan_a_id, scan_b_id)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$, 'alice cannot compare against bob''s scan');
select tests.fails($$insert into public.saved_comparisons (scan_a_id, scan_b_id)
  values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$, 'a scan cannot be compared with itself');

select tests.as_user('00000000-0000-0000-0000-0000000000b2');
select tests.ok((select count(*) from public.saved_comparisons) = 0, 'bob cannot see alice''s comparisons');
select tests.fails($$insert into public.saved_comparisons (scan_a_id, scan_b_id)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')$$, 'bob cannot reference alice''s scan');

reset role;
select tests.ok((select count(*) from public.profiles where display_name = 'hacked') = 0, 'alice''s update of bob''s profile affected nothing');
set local role authenticated;

-- ---------------------------------------------------------------- community reports
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
with r as (
  insert into public.community_reports (company_name, description, evidence_excerpt, scan_id)
  values ('Global Data Solutions', 'They asked me to pay a registration fee before any interview.', 'pay a refundable registration fee', '10000000-0000-0000-0000-000000000001')
  returning id
)
insert into tests.ids select 'report', id from r;
select tests.ok((select moderation_status from public.community_reports where id = tests.id('report')) = 'pending', 'new reports start pending');
select tests.fails($$insert into public.community_reports (company_name, description, moderation_status)
  values ('X Corp', 'This report tries to approve itself directly on insert.', 'approved')$$, 'reporter cannot set moderation_status');
select tests.fails($$insert into public.community_reports (company_name, description, reporter_id)
  values ('X Corp', 'This report tries to impersonate another reporter account.', '00000000-0000-0000-0000-0000000000b2')$$, 'reporter cannot set reporter_id');
select tests.fails($$insert into public.community_reports (company_name, description, scan_id)
  values ('X Corp', 'This report links a scan that belongs to someone else.', '20000000-0000-0000-0000-000000000001')$$, 'reporter cannot link another user''s scan');
select tests.fails($$insert into public.community_reports (company_name, description) values ('X Corp', 'too short')$$, 'description length is enforced');
select tests.fails($$update public.community_reports set moderation_status = 'approved'$$, 'reporter cannot moderate by direct update');
select tests.fails($$select public.moderate_report(tests.id('report'), 'approve', 'self approval')$$, 'non-admin cannot call moderate_report');
select tests.fails($$insert into public.moderation_actions (report_id, action, previous_status, new_status, reason)
  values (tests.id('report'), 'approve', 'pending', 'approved', 'forged')$$, 'users cannot write the moderation log');

select tests.as_user('00000000-0000-0000-0000-0000000000b2');
select tests.ok((select count(*) from public.community_reports) = 0, 'bob cannot see alice''s pending report');
select tests.ok((select count(*) from public.public_community_reports) = 0, 'pending reports are not public');
select tests.fails($$insert into public.report_flags (report_id, reason) values (tests.id('report'), 'spam')$$, 'cannot flag a report that is not public');

-- admin approves
select tests.as_user('00000000-0000-0000-0000-0000000000ad');
select tests.ok(public.is_admin(), 'admin is recognised');
select tests.fails($$select public.moderate_report(tests.id('report'), 'approve', '')$$, 'moderation requires a reason');
select tests.fails($$select public.moderate_report(tests.id('report'), 'delete_everything', 'nope')$$, 'unknown moderation actions are rejected');
select tests.ok((select (public.moderate_report(tests.id('report'), 'approve', 'Meets reporting guidelines')).moderation_status) = 'approved', 'admin approves report');
select tests.ok((select count(*) from public.moderation_actions) = 1, 'approval is logged');
select tests.ok((select count(*) from public.community_reports) = 1, 'admin can read all reports');
select tests.ok((select count(*) from public.profiles) = 5, 'admin can read all profiles');

set local role anon;
select tests.as_user(null);
select tests.ok((select count(*) from public.public_community_reports) = 1, 'approved report is public');
reset role;
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'public_community_reports' and column_name in ('reporter_id', 'scan_id', 'flag_count')),
  'public view does not expose reporter identity, linked scan or flags');
set local role authenticated;

-- flags
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select tests.fails($$insert into public.report_flags (report_id, reason) values (tests.id('report'), 'spam')$$, 'reporter cannot flag her own report');
select tests.as_user('00000000-0000-0000-0000-0000000000b2');
select tests.ok((select count(*) from public.moderation_actions) = 0, 'bob cannot read the moderation log');
insert into public.report_flags (report_id, reason) values (tests.id('report'), 'inaccurate');
select tests.fails($$insert into public.report_flags (report_id, reason) values (tests.id('report'), 'spam')$$, 'one flag per user per report');
select tests.fails($$insert into public.report_flags (report_id, reason, flagger_id) values (tests.id('report'), 'spam', '00000000-0000-0000-0000-0000000000c3')$$, 'cannot flag on behalf of someone else');
select tests.as_user('00000000-0000-0000-0000-0000000000c3');
insert into public.report_flags (report_id, reason) values (tests.id('report'), 'harassment');
select tests.as_user('00000000-0000-0000-0000-0000000000d4');
insert into public.report_flags (report_id, reason) values (tests.id('report'), 'personal_information');

set local role anon;
select tests.as_user(null);
select tests.ok((select count(*) from public.public_community_reports) = 0, 'three flags hide the report automatically');
set local role authenticated;
select tests.as_user('00000000-0000-0000-0000-0000000000ad');
select tests.ok((select moderation_status from public.community_reports where id = tests.id('report')) = 'pending', 'auto-hidden report is back in the queue');
select tests.ok((select count(*) from public.moderation_actions where action = 'auto_requeue') = 1, 'auto-requeue is logged');

-- ---------------------------------------------------------------- rate limiting
select tests.as_user('00000000-0000-0000-0000-0000000000a1');
select tests.ok(public.check_rate_limit('scan', 2, 600), 'rate limit: 1st request allowed');
select tests.ok(public.check_rate_limit('scan', 2, 600), 'rate limit: 2nd request allowed');
select tests.ok(not public.check_rate_limit('scan', 2, 600), 'rate limit: 3rd request blocked');
select tests.ok(public.check_rate_limit('scan', 100, 1), 'different parameters use a separate counter');
select tests.ok(not public.check_rate_limit('scan', 2, 600), 'other parameters cannot reset the server''s counter');
select tests.as_user('00000000-0000-0000-0000-0000000000b2');
select tests.ok(public.check_rate_limit('scan', 2, 600), 'rate limits are per user');
select tests.fails($$select public.check_rate_limit('scan', 0, 600)$$, 'invalid rate-limit parameters are rejected');
select tests.fails($$select * from private.rate_limits$$, 'rate-limit table is not accessible');

-- ---------------------------------------------------------------- admin stats & benchmarks
select tests.fails($$select public.admin_stats()$$, 'non-admin cannot read admin stats');
select tests.fails($$insert into public.salary_benchmarks (role_keyword, country, currency, period, min_amount, max_amount, source_name, source_url, retrieved_at)
  values ('data entry', 'India', 'INR', 'month', 1, 2, 'x', 'https://x.example', current_date)$$, 'non-admin cannot add salary benchmarks');
select tests.as_user('00000000-0000-0000-0000-0000000000ad');
select tests.ok((public.admin_stats() ->> 'total_scans')::int = 3, 'admin stats count all scans');
insert into public.salary_benchmarks (role_keyword, country, currency, period, min_amount, max_amount, source_name, source_url, retrieved_at)
values ('data entry', 'India', 'INR', 'month', 12000, 22000, 'Test source', 'https://example.org/s', current_date);
select tests.as_user('00000000-0000-0000-0000-0000000000b2');
select tests.ok((select count(*) from public.salary_benchmarks) = 1, 'authenticated users can read benchmarks');

-- ---------------------------------------------------------------- account deletion cascade
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select tests.ok((select count(*) from public.scans where owner_id = '00000000-0000-0000-0000-0000000000a1') = 0, 'deleting a user deletes their scans');
select tests.ok((select count(*) from public.saved_comparisons) = 0, 'deleting a user deletes their comparisons');
select tests.ok((select reporter_id from public.community_reports where id = tests.id('report')) is null, 'reports are detached from deleted reporters');

\echo 'ALL RLS TESTS PASSED'
rollback;
