#!/usr/bin/env bash
#
# Executes the publication-limit and picked-master draft contract against
# throwaway local PostgreSQL databases:
#
#   limits-preflight-fixture.sql        live-derived current state + baselines
#   0131_order_publish_limit.sql        forward draft, gap Р4
#   0133_order_picked_master.sql        forward draft, gap Р1
#   limits-postflight-assertions.sql    behaviour + inertness assertions
#   0132 / 0134                         the rollback drafts and their guards
#   limits-revert-assertions.sql        rollback equivalence assertions
#   limits-negative-controls.sql        proves the assertions can go red
#
# Three phases, all of which must pass:
#   1. guards   — each forward draft must REFUSE to overwrite a foreign object,
#                 and each rollback must REFUSE to drop one;
#   2. contract — forward, assertions, rollback, rollback assertions;
#   3. negative controls — every mutation must be caught by the assertions.
#
# Passing proves the drafts' internal contract against a schema derived from a
# read-only production snapshot taken on 2026-08-30. It is NOT production
# approval: see supabase/migration-drafts/README.md.
#
# A missing PostgreSQL is reported LOUDLY and exits 0 so that a machine without
# a database does not pretend to have run the checks. Set
# XTRUD_FIXTURE_REQUIRE=1 to turn every skip into a hard failure.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${XTRUD_FIXTURE_PGPORT:-5433}"
SUPERUSER="${XTRUD_FIXTURE_PGUSER:-postgres}"
REQUIRE="${XTRUD_FIXTURE_REQUIRE:-0}"

MUTATIONS=(
  drop_publication_limit_trigger
  limit_guard_ignores_updates
  limit_guard_open_cap_off_by_one
  limit_guard_exempts_reopen
  limit_guard_no_rate_cap
  limit_guard_rate_cap_counts_open_only
  limit_guard_blocks_closing
  limit_guard_blocks_server_paths
  limit_guard_drops_advisory_lock
  limit_guard_counts_every_client
  grant_limit_guard_to_api_roles
  drop_picked_master_trigger
  picked_guard_skips_responder_check
  picked_guard_allows_reassignment
  picked_guard_ignores_cancel_reason
  picked_guard_blocks_reopen
  picked_guard_validates_resting_state
  picked_guard_does_not_stamp_picked_at
  picked_guard_requires_a_master
  notify_keeps_duplicate_push
  grant_picked_guard_to_api_roles
  sneak_in_an_orders_policy
)

banner() {
  echo "================================================================"
  printf '%s\n' "$@"
  echo "================================================================"
}

skip() {
  banner "SKIP: the publication-limit fixture DID NOT RUN." "$@" \
    "SKIP: this is NOT a pass. Nothing about the drafts was verified."
  if [ "$REQUIRE" = "1" ]; then
    echo "XTRUD_FIXTURE_REQUIRE=1 — treating the skip as a failure." >&2
    exit 1
  fi
  exit 0
}

if ! command -v psql >/dev/null 2>&1; then
  skip "Reason: the PostgreSQL client (psql) is not installed on this machine."
fi

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

STAGE="$(mktemp -d)"
chmod 755 "$STAGE"
DB_PREFIX="xtrud_limits_"
DB_SUFFIX="_$$"

# Cleanup enumerates the server, deliberately, instead of remembering names in a
# shell array: every database below is created through `db="$(new_db ...)"`, a
# command substitution, which runs in a SUBSHELL — an array appended to there is
# lost in the parent, and the throwaway databases survive the run.
cleanup() {
  local db
  while read -r db; do
    [ -n "$db" ] && as_super "dropdb -p ${PORT} --if-exists ${db}" >/dev/null 2>&1 || true
  done < <(as_super "psql -p ${PORT} -d postgres -X -tAc \"SELECT datname FROM pg_database WHERE datname LIKE '${DB_PREFIX}%${DB_SUFFIX}'\"" 2>/dev/null || true)
  rm -rf "$STAGE"
}
trap cleanup EXIT

stage_file() {
  cp "$ROOT/$1" "$STAGE/$2"
  chmod 644 "$STAGE/$2"
}

# The repository is not readable by the database OS role, so every script is
# staged into a world-readable temporary directory first.
stage_file "scripts/supabase/limits-preflight-fixture.sql"             "01-preflight.sql"
stage_file "supabase/migration-drafts/0131_order_publish_limit.sql"    "02-forward-p4.sql"
stage_file "supabase/migration-drafts/0133_order_picked_master.sql"    "03-forward-p1.sql"
stage_file "scripts/supabase/limits-postflight-assertions.sql"         "04-postflight.sql"
stage_file "supabase/migration-drafts/0132_revert_order_publish_limit.sql" "05-revert-p4.sql"
stage_file "supabase/migration-drafts/0134_revert_order_picked_master.sql" "06-revert-p1.sql"
stage_file "scripts/supabase/limits-revert-assertions.sql"             "07-revert-assertions.sql"
stage_file "scripts/supabase/limits-negative-controls.sql"             "08-mutation.sql"

new_db() {
  local db="${DB_PREFIX}$1${DB_SUFFIX}"
  as_super "dropdb -p ${PORT} --if-exists ${db}" >/dev/null 2>&1 || true
  as_super "createdb -p ${PORT} ${db}"
  echo "$db"
}

run_step() {
  local db="$1" label="$2" file="$3"
  echo
  echo "---- ${label} (${file}) ----"
  as_super "psql -p ${PORT} -d ${db} -X -v ON_ERROR_STOP=1 -f ${STAGE}/${file}" \
    | grep -E '^(NOTICE|ERROR|PREFLIGHT|POSTFLIGHT|REVERT|===)' || true
}

run_step_expect_fail() {
  local db="$1" label="$2" file="$3" expect="$4"
  echo
  echo "---- ${label} (${file}) — MUST FAIL ----"
  local out status
  set +e
  out="$(as_super "psql -p ${PORT} -d ${db} -X -v ON_ERROR_STOP=1 -f ${STAGE}/${file}" 2>&1)"
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    echo "$out"
    echo "FAIL: ${label} succeeded, but it had to be refused." >&2
    exit 1
  fi
  if [ -n "$expect" ] && ! printf '%s' "$out" | grep -qF "$expect"; then
    echo "$out"
    echo "FAIL: ${label} was refused for the wrong reason (expected to see: ${expect})." >&2
    exit 1
  fi
  printf '%s\n' "$out" | grep -E 'ERROR|FAIL' | head -3
  echo "OK: refused as required."
}

sql() {
  local db="$1" statement="$2"
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -c \"${statement}\""
}

banner "publication-limit draft fixture (gaps Р4 and Р1)" \
  "PostgreSQL server: ${SERVER_VERSION} (local, port ${PORT})" \
  "NOTE: a local server version is not the production version. Local success" \
  "does not substitute for the restored-snapshot rehearsal."

# ---------------------------------------------------------------------------
# Phase 1 — the guards that stop a draft from clobbering somebody else's object
# ---------------------------------------------------------------------------
banner "PHASE 1/3 — collision and ownership guards must refuse"

DB_GUARD="$(new_db guard)"
run_step "$DB_GUARD" "preflight: live-derived current state" "01-preflight.sql"

# A function with the guard's name already exists, created by somebody else.
sql "$DB_GUARD" "CREATE FUNCTION public.guard_order_publication_limit() RETURNS trigger LANGUAGE plpgsql AS \\\$\\\$ BEGIN RETURN NEW; END \\\$\\\$"
run_step_expect_fail "$DB_GUARD" "0131 over a foreign object of the same name" "02-forward-p4.sql" \
  "order_publish_limit_object_name_collision_requires_live_audit"
sql "$DB_GUARD" "DROP FUNCTION public.guard_order_publication_limit()"

# The one live function 0133 replaces has drifted since the hash was taken.
sql "$DB_GUARD" "CREATE OR REPLACE FUNCTION public.trg_notify_order_cancelled_or_expired() RETURNS trigger LANGUAGE plpgsql AS \\\$\\\$ BEGIN RETURN NEW; END \\\$\\\$"
run_step_expect_fail "$DB_GUARD" "0133 over a diverged notification function" "03-forward-p1.sql" \
  "order_picked_master_notify_function_diverged_requires_live_audit"

# A rollback must not drop an object it did not create.
DB_GUARD2="$(new_db guard2)"
run_step "$DB_GUARD2" "preflight: live-derived current state" "01-preflight.sql"
run_step "$DB_GUARD2" "forward draft 0131 (Р4)" "02-forward-p4.sql"
sql "$DB_GUARD2" "COMMENT ON FUNCTION public.guard_order_publication_limit() IS 'somebody else owns this now'"
run_step_expect_fail "$DB_GUARD2" "0132 against a foreign object" "05-revert-p4.sql" \
  "order_publish_limit_revert_refuses_foreign_object"

# ---------------------------------------------------------------------------
# Phase 2 — the contract
# ---------------------------------------------------------------------------
banner "PHASE 2/3 — forward drafts, behaviour, rollback, rollback equivalence"

DB_MAIN="$(new_db main)"
run_step "$DB_MAIN" "1/7 preflight: live-derived current state"     "01-preflight.sql"
run_step "$DB_MAIN" "2/7 forward draft 0131 (Р4 publication limit)" "02-forward-p4.sql"
run_step "$DB_MAIN" "3/7 forward draft 0133 (Р1 picked master)"     "03-forward-p1.sql"
run_step "$DB_MAIN" "4/7 postflight: behaviour assertions"          "04-postflight.sql"
run_step "$DB_MAIN" "5/7 rollback draft 0134 (Р1)"                  "06-revert-p1.sql"
run_step "$DB_MAIN" "6/7 rollback draft 0132 (Р4)"                  "05-revert-p4.sql"
run_step "$DB_MAIN" "7/7 rollback equivalence assertions"           "07-revert-assertions.sql"

# ---------------------------------------------------------------------------
# Phase 3 — negative controls
# ---------------------------------------------------------------------------
banner "PHASE 3/3 — negative controls: every mutation must be CAUGHT" \
  "${#MUTATIONS[@]} mutations, each on a fresh database."

CAUGHT=0
MISSED=0
MISSED_NAMES=()

for mutation in "${MUTATIONS[@]}"; do
  db="$(new_db "neg")"
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/01-preflight.sql" >/dev/null
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/02-forward-p4.sql" >/dev/null
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/03-forward-p1.sql" >/dev/null
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -v mutation=${mutation} -f ${STAGE}/08-mutation.sql" >/dev/null

  set +e
  out="$(as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/04-postflight.sql" 2>&1)"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    CAUGHT=$((CAUGHT + 1))
    reason="$(printf '%s' "$out" | grep -m1 -E 'ASSERT FAIL|ERROR' | cut -c1-140)"
    printf '  CAUGHT   %-40s %s\n' "$mutation" "$reason"
  else
    MISSED=$((MISSED + 1))
    MISSED_NAMES+=("$mutation")
    printf '  MISSED   %-40s the assertions accepted the broken draft\n' "$mutation"
  fi

  as_super "dropdb -p ${PORT} --if-exists ${db}" >/dev/null 2>&1 || true
done

echo
echo "negative controls: ${CAUGHT} caught / ${MISSED} not caught (of ${#MUTATIONS[@]})"

if [ "$MISSED" -ne 0 ]; then
  banner "FAIL: the assertions cannot detect these mutations:" "${MISSED_NAMES[@]}" \
    "An assertion that cannot go red is not a test."
  exit 1
fi

banner "PASS: collision guards, forward drafts, behaviour, rollback," \
  "rollback equivalence and ${CAUGHT}/${#MUTATIONS[@]} negative controls all verified." \
  "Scope: a schema derived from the 2026-08-30 read-only production snapshot." \
  "The live ACL, policy set and migration ledger remain unverified and still" \
  "block promotion."
