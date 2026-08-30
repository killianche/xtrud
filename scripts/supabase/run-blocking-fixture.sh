#!/usr/bin/env bash
#
# Executes the user-blocking draft contract against a throwaway local
# PostgreSQL database:
#
#   blocking-preflight-fixture.sql      current-state schema + baselines
#   0124_user_blocking_core.sql         the forward draft
#   blocking-postflight-assertions.sql  behaviour + inertness assertions
#   0125_revert_user_blocking_core.sql  the rollback draft
#   blocking-revert-assertions.sql      rollback equivalence assertions
#
# Passing proves the draft's internal contract against a synthetic schema.
# It is NOT production approval: see supabase/migration-drafts/README.md.
#
# A missing PostgreSQL is reported LOUDLY and exits 0 so that a machine without
# a database does not pretend to have run the checks. Set
# XTRUD_FIXTURE_REQUIRE=1 to turn every skip into a hard failure.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${XTRUD_FIXTURE_PGPORT:-5433}"
SUPERUSER="${XTRUD_FIXTURE_PGUSER:-postgres}"
REQUIRE="${XTRUD_FIXTURE_REQUIRE:-0}"

banner() {
  echo "================================================================"
  printf '%s\n' "$@"
  echo "================================================================"
}

skip() {
  banner "SKIP: the user-blocking fixture DID NOT RUN." "$@" \
    "SKIP: this is NOT a pass. Nothing about the blocking contract was verified."
  if [ "$REQUIRE" = "1" ]; then
    echo "XTRUD_FIXTURE_REQUIRE=1 — treating the skip as a failure." >&2
    exit 1
  fi
  exit 0
}

if ! command -v psql >/dev/null 2>&1; then
  skip "Reason: the PostgreSQL client (psql) is not installed on this machine."
fi

# Prefer running as the cluster superuser when this process is root.
if [ "$(id -u)" = "0" ] && id "$SUPERUSER" >/dev/null 2>&1; then
  as_super() { su "$SUPERUSER" -c "$1"; }
else
  as_super() { bash -c "$1"; }
fi

if ! as_super "psql -p ${PORT} -d postgres -X -tAc 'SELECT 1'" >/dev/null 2>&1; then
  skip "Reason: no reachable PostgreSQL cluster on port ${PORT} as role ${SUPERUSER}." \
       "Set XTRUD_FIXTURE_PGPORT / XTRUD_FIXTURE_PGUSER if the cluster lives elsewhere."
fi

SERVER_VERSION="$(as_super "psql -p ${PORT} -d postgres -X -tAc 'SHOW server_version'" | tr -d '[:space:]')"

DB="xtrud_blocking_fixture_$$"
STAGE="$(mktemp -d)"
chmod 755 "$STAGE"

cleanup() {
  as_super "dropdb -p ${PORT} --if-exists ${DB}" >/dev/null 2>&1 || true
  rm -rf "$STAGE"
}
trap cleanup EXIT

stage_file() {
  cp "$ROOT/$1" "$STAGE/$2"
  chmod 644 "$STAGE/$2"
}

# The repository is not readable by the database OS role, so every script is
# staged into a world-readable temporary directory first.
stage_file "scripts/supabase/blocking-preflight-fixture.sql"      "01-preflight.sql"
stage_file "supabase/migration-drafts/0124_user_blocking_core.sql" "02-forward.sql"
stage_file "scripts/supabase/blocking-postflight-assertions.sql"  "03-postflight.sql"
stage_file "supabase/migration-drafts/0125_revert_user_blocking_core.sql" "04-revert.sql"
stage_file "scripts/supabase/blocking-revert-assertions.sql"      "05-revert-assertions.sql"

run_step() {
  local label="$1" file="$2"
  echo
  echo "---- ${label} (${file}) ----"
  as_super "psql -p ${PORT} -d ${DB} -X -v ON_ERROR_STOP=1 -f ${STAGE}/${file}"
}

banner "user-blocking draft fixture" \
  "PostgreSQL server: ${SERVER_VERSION} (local, port ${PORT})" \
  "NOTE: a local server version is not the production version. Local success" \
  "does not substitute for the restored-snapshot rehearsal."

as_super "createdb -p ${PORT} ${DB}"

run_step "1/5 preflight: current-state fixture" "01-preflight.sql"
run_step "2/5 forward draft 0124_user_blocking_core" "02-forward.sql"
run_step "3/5 postflight: blocking contract assertions" "03-postflight.sql"
run_step "4/5 rollback draft 0125_revert_user_blocking_core" "04-revert.sql"
run_step "5/5 rollback equivalence assertions" "05-revert-assertions.sql"

echo
banner "PASS: forward draft, blocking contract and rollback all verified" \
  "Scope: synthetic current-state schema only. The live schema, ACL, policy" \
  "set and migration ledger remain unverified and still block promotion."
