#!/usr/bin/env bash
# Runs the Supabase migrations + RLS tests.
#
#   Option A (recommended): local Supabase
#     supabase start && supabase db reset
#     SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:rls
#
#   Option B: any throwaway PostgreSQL 15+ (uses a stub of Supabase's auth schema)
#     PG_URL=postgresql://user:pass@localhost:5432/postgres npm run test:rls
#     (creates and drops a temporary database "jobshield_rls_test")
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "Running RLS tests against Supabase database (migrations must already be applied)…"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
  exit 0
fi

if [[ -z "${PG_URL:-}" ]]; then
  echo "Set SUPABASE_DB_URL (local Supabase) or PG_URL (plain Postgres)." >&2
  exit 1
fi

DB=jobshield_rls_test
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
TEST_URL="${PG_URL%/*}/$DB"
trap 'psql "$PG_URL" -q -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$TEST_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
