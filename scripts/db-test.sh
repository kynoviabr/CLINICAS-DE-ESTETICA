#!/usr/bin/env bash
# Applies every migration to an empty Postgres and runs tests/db/*.test.sql.
# Usage: DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/db-test.sh
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
cd "$(dirname "$0")/.."

psql_run() { psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 "$@"; }

psql_run -f tests/db/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migration: $f"
  psql_run -1 -f "$f"
done
psql_run -f tests/db/supabase_grants.sql

for t in tests/db/*.test.sql; do
  echo "test: $t"
  if ! out=$(psql_run -f "$t" 2>&1); then
    echo "$out"
    exit 1
  fi
  echo "$out" | grep -E "PASS" || true
done
echo "db tests ok"
