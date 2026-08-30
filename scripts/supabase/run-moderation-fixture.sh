#!/usr/bin/env bash
#
# Executes the moderation draft contract against throwaway local PostgreSQL
# databases:
#
#   moderation-preflight-fixture.sql        current-state schema + baselines
#   0126_suspension_enforcement.sql         forward draft, gap Р3
#   0128_order_moderation.sql               forward draft, gap Р5
#   moderation-postflight-assertions.sql    behaviour + inertness assertions
#   0127 / 0129                             the rollback drafts and their guards
#   moderation-revert-assertions.sql        rollback equivalence assertions
#   moderation-negative-controls.sql        proves the assertions can go red
#
# Three phases, all of which must pass:
#   1. ordering — 0128 must REFUSE to apply without the is_admin lock from 0126;
#   2. contract — forward, assertions, both rollback guards, rollback assertions;
#   3. negative controls — every mutation must be caught by the assertions.
#
# Passing proves the drafts' internal contract against a synthetic schema.
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

MUTATIONS=(
  drop_orders_content_trigger
  drop_users_privilege_trigger
  content_guard_ignores_updates
  content_guard_only_banned
  content_guard_skips_definer_rpc
  drop_hidden_select_policies
  hidden_policies_become_permissive
  drop_moderation_column_guard
  response_guard_becomes_invoker
  rpc_skips_admin_check
  drop_admin_select_policy
  grant_rpc_to_anon
  content_guard_exempts_reviews
  content_guard_forgets_orders_columns
  hidden_policies_allow_everyone
  moderation_column_guard_noop
  response_guard_noop
  admin_select_only_open
  users_guard_forgets_status
)

banner() {
  echo "================================================================"
  printf '%s\n' "$@"
  echo "================================================================"
}

skip() {
  banner "SKIP: the moderation fixture DID NOT RUN." "$@" \
    "SKIP: this is NOT a pass. Nothing about the moderation contract was verified."
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
DBS=()

cleanup() {
  for db in "${DBS[@]:-}"; do
    [ -n "$db" ] && as_super "dropdb -p ${PORT} --if-exists ${db}" >/dev/null 2>&1 || true
  done
  rm -rf "$STAGE"
}
trap cleanup EXIT

stage_file() {
  cp "$ROOT/$1" "$STAGE/$2"
  chmod 644 "$STAGE/$2"
}

# The repository is not readable by the database OS role, so every script is
# staged into a world-readable temporary directory first.
stage_file "scripts/supabase/moderation-preflight-fixture.sql"        "01-preflight.sql"
stage_file "supabase/migration-drafts/0126_suspension_enforcement.sql" "02-forward-p3.sql"
stage_file "supabase/migration-drafts/0128_order_moderation.sql"       "03-forward-p5.sql"
stage_file "scripts/supabase/moderation-postflight-assertions.sql"    "04-postflight.sql"
stage_file "supabase/migration-drafts/0127_revert_suspension_enforcement.sql" "05-revert-p3.sql"
stage_file "supabase/migration-drafts/0129_revert_order_moderation.sql"       "06-revert-p5.sql"
stage_file "scripts/supabase/moderation-revert-assertions.sql"        "07-revert-assertions.sql"
stage_file "scripts/supabase/moderation-negative-controls.sql"        "08-mutation.sql"

new_db() {
  local db="xtrud_moderation_$1_$$"
  DBS+=("$db")
  as_super "createdb -p ${PORT} ${db}"
  echo "$db"
}

run_step() {
  local db="$1" label="$2" file="$3"
  echo
  echo "---- ${label} (${file}) ----"
  as_super "psql -p ${PORT} -d ${db} -X -v ON_ERROR_STOP=1 -f ${STAGE}/${file}"
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
  as_super "psql -p ${PORT} -d ${db} -X -v ON_ERROR_STOP=1 -c \"${statement}\""
}

banner "moderation draft fixture (gaps Р3 and Р5)" \
  "PostgreSQL server: ${SERVER_VERSION} (local, port ${PORT})" \
  "NOTE: a local server version is not the production version. Local success" \
  "does not substitute for the restored-snapshot rehearsal."

# ---------------------------------------------------------------------------
# Phase 1 — ordering guard
# ---------------------------------------------------------------------------
banner "PHASE 1/3 — 0128 must refuse to run without the is_admin lock"

DB_ORDER="$(new_db order)"
run_step "$DB_ORDER" "preflight: current-state fixture" "01-preflight.sql"
run_step_expect_fail "$DB_ORDER" "0128 without 0126" "03-forward-p5.sql" \
  "order_moderation_requires_is_admin_hardening_first"

# ---------------------------------------------------------------------------
# Phase 2 — the contract
# ---------------------------------------------------------------------------
banner "PHASE 2/3 — forward drafts, behaviour, rollback guards, rollback"

DB_MAIN="$(new_db main)"
run_step "$DB_MAIN" "1/9 preflight: current-state fixture"            "01-preflight.sql"
run_step "$DB_MAIN" "2/9 forward draft 0126 (Р3 suspension)"          "02-forward-p3.sql"
run_step "$DB_MAIN" "3/9 forward draft 0128 (Р5 order moderation)"    "03-forward-p5.sql"
run_step "$DB_MAIN" "4/9 postflight: behaviour assertions"            "04-postflight.sql"

run_step_expect_fail "$DB_MAIN" "5/9 rollback of 0126 while 0128 is applied" "05-revert-p3.sql" \
  "suspension_revert_blocked_by_order_moderation"

echo
echo "---- 6/9 hide a task, then attempt the 0129 rollback ----"
sql "$DB_MAIN" "UPDATE public.orders SET moderation_hidden_at = now() WHERE id = '70000000-0000-4000-8000-000000000007'"
run_step_expect_fail "$DB_MAIN" "rollback of 0128 while a task is hidden" "06-revert-p5.sql" \
  "order_moderation_revert_would_republish_hidden_tasks"

echo
echo "---- 7/9 unhide, then roll back for real ----"
sql "$DB_MAIN" "UPDATE public.orders SET moderation_hidden_at = NULL, moderation_hidden_by = NULL"
run_step "$DB_MAIN" "7/9 rollback draft 0129 (Р5)" "06-revert-p5.sql"
run_step "$DB_MAIN" "8/9 rollback draft 0127 (Р3)" "05-revert-p3.sql"
run_step "$DB_MAIN" "9/9 rollback equivalence assertions" "07-revert-assertions.sql"

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
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/02-forward-p3.sql" >/dev/null
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/03-forward-p5.sql" >/dev/null
  as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -v mutation=${mutation} -f ${STAGE}/08-mutation.sql" >/dev/null

  set +e
  out="$(as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/04-postflight.sql" 2>&1)"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    CAUGHT=$((CAUGHT + 1))
    reason="$(printf '%s' "$out" | grep -m1 -E 'ASSERT FAIL|ERROR' | cut -c1-140)"
    printf '  CAUGHT   %-38s %s\n' "$mutation" "$reason"
  else
    MISSED=$((MISSED + 1))
    MISSED_NAMES+=("$mutation")
    printf '  MISSED   %-38s the assertions accepted the broken draft\n' "$mutation"
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

banner "PASS: forward drafts, ordering guard, behaviour, rollback guards," \
  "rollback equivalence and ${CAUGHT}/${#MUTATIONS[@]} negative controls all verified." \
  "Scope: synthetic current-state schema only. The live schema, ACL, policy" \
  "set and migration ledger remain unverified and still block promotion."
