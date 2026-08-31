#!/usr/bin/env bash
#
# Репетиция черновиков «закалки базы» (docs/ADMIN_PANEL.md §9.1, шаг 1) на
# одноразовых локальных базах PostgreSQL.
#
#   hardening-preflight-fixture.sql        текущее состояние, ГРАНТЫ ВКЛЮЧЕНЫ
#   0135_api_column_grants.sql             колоночные гранты API-ролей
#   0137_admin_session_function.sql        is_admin_session()
#   0139_admin_actions_journal.sql         журнал admin_actions
#   0141_narrow_admin_user_update.sql      сужение админской политики
#   hardening-postflight-assertions.sql    поведение под настоящими ролями
#   0142 / 0140 / 0138 / 0136              откаты в обратном порядке
#   hardening-revert-assertions.sql        эквивалентность отката
#   hardening-negative-controls.sql        доказательство, что ассерты падают
#
# Четыре фазы, все обязаны пройти:
#   1. зависимости — 0139 и 0141 обязаны ОТКАЗАТЬСЯ без своих предусловий;
#   2. контракт — применение, поведение, откат, эквивалентность;
#   3. ассерты обязаны краснеть — набор проверок прогоняется на НЕзакалённой
#      базе и обязан упасть; «зелено везде» означает, что он ничего не мерит;
#   4. негативные контроли — каждая мутация обязана быть поймана.
#
# ГЛАВНОЕ ПРЕДУПРЕЖДЕНИЕ ПРО СХЕМУ. Синтетическая фикстура воспроизводит живые
# ГРАНТЫ намеренно. Репетиция на схеме, снятой с --no-privileges, для этой
# работы бесполезна: там любое «нельзя» проходит просто потому, что права не
# выдавались, и результат ложно-зелёный.
#
# Если есть снимок production схемы, снятый БЕЗ --no-privileges, укажите его
# через XTRUD_LIVE_SCHEMA_SQL. Тогда добавляется ФАЗА 0:
#
#   pg_dump --schema-only -n public -n auth -f live.sql      # НЕ --no-privileges
#   XTRUD_LIVE_SCHEMA_SQL=$PWD/live.sql scripts/supabase/run-hardening-fixture.sh
#
# Что фаза 0 доказывает и чего НЕ доказывает — сказано прямо, потому что
# соблазн выдать её за полную репетицию велик:
#
#   ДОКАЗЫВАЕТ: черновики применяются к НАСТОЯЩЕЙ схеме; список колонок в 0135
#   совпадает с живым поколоночно; сужение грантов реально срабатывает на
#   живых ACL; откат 0136 восстанавливает ACL побитово.
#
#   НЕ ДОКАЗЫВАЕТ поведение: snapshot схемы не содержит строк, поэтому
#   поведенческий матрикс на нём не запускается. Фазы 1-4 всегда идут на
#   синтетической фикстуре с воспроизведёнными живыми грантами.
#
# Прохождение доказывает внутренний контракт черновиков. Это НЕ разрешение на
# production: см. supabase/migration-drafts/README.md.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${XTRUD_FIXTURE_PGPORT:-5433}"
SUPERUSER="${XTRUD_FIXTURE_PGUSER:-postgres}"
REQUIRE="${XTRUD_FIXTURE_REQUIRE:-0}"
LIVE_SCHEMA="${XTRUD_LIVE_SCHEMA_SQL:-}"

MUTATIONS=(
  regrant_table_update_users
  regrant_ranking_score
  regrant_users_insert
  regrant_rating_columns
  regrant_anon_update
  regrant_truncate
  recalc_back_to_invoker
  drop_needed_last_seen_feed_at
  drop_needed_responses_count
  drop_needed_picked_master_id
  drop_needed_response_status
  drop_needed_users_status
  drop_acl_baseline
  admin_session_trusts_jwt_aal
  admin_session_ignores_aal
  admin_session_ignores_admin_flag
  admin_session_ignores_user_status
  admin_session_granted_to_anon
  journal_grant_insert_to_authenticated
  journal_drop_row_triggers
  journal_drop_truncate_trigger
  journal_rls_permits_everyone
  journal_rls_disabled
  journal_select_granted_to_anon
  journal_rpc_skips_admin_check
  journal_reason_check_dropped
  journal_action_check_dropped
  admin_policy_back_to_is_current_user_admin
  drop_admin_scope_trigger
  admin_scope_trigger_noop
  admin_scope_trigger_column_list_misses_phone
  admin_scope_trigger_skips_admin_path
  disable_applied_0130_trigger
)

banner() {
  echo "================================================================"
  printf '%s\n' "$@"
  echo "================================================================"
}

skip() {
  banner "SKIP: репетиция НЕ ЗАПУСКАЛАСЬ." "$@" \
    "SKIP: это не «пройдено». Ничего из контракта черновиков не проверено."
  if [ "$REQUIRE" = "1" ]; then
    echo "XTRUD_FIXTURE_REQUIRE=1 — пропуск считается провалом." >&2
    exit 1
  fi
  exit 0
}

command -v psql >/dev/null 2>&1 || skip "Причина: psql не установлен."

if [ "$(id -u)" = "0" ] && id "$SUPERUSER" >/dev/null 2>&1; then
  as_super() { su "$SUPERUSER" -c "$1"; }
else
  as_super() { bash -c "$1"; }
fi

as_super "psql -p ${PORT} -d postgres -X -tAc 'SELECT 1'" >/dev/null 2>&1 \
  || skip "Причина: нет доступного кластера PostgreSQL на порту ${PORT} под ролью ${SUPERUSER}." \
          "Задайте XTRUD_FIXTURE_PGPORT / XTRUD_FIXTURE_PGUSER, если кластер в другом месте."

SERVER_VERSION="$(as_super "psql -p ${PORT} -d postgres -X -tAc 'SHOW server_version'" | tr -d '[:space:]')"

STAGE="$(mktemp -d)"
chmod 755 "$STAGE"
declare -a DBS=()

cleanup() {
  if [ "${#DBS[@]}" -gt 0 ]; then
    for db in "${DBS[@]}"; do
      as_super "dropdb -p ${PORT} --if-exists ${db}" >/dev/null 2>&1 || true
    done
  fi
  rm -rf "$STAGE"
}
trap cleanup EXIT

stage() { cp "$ROOT/$1" "$STAGE/$2"; chmod 644 "$STAGE/$2"; }

stage "scripts/supabase/hardening-preflight-fixture.sql"        "01-preflight.sql"
stage "supabase/migration-drafts/0135_api_column_grants.sql"             "02-grants.sql"
stage "supabase/migration-drafts/0137_admin_session_function.sql"        "03-session.sql"
stage "supabase/migration-drafts/0139_admin_actions_journal.sql"         "04-journal.sql"
stage "supabase/migration-drafts/0141_narrow_admin_user_update.sql"      "05-policy.sql"
stage "scripts/supabase/hardening-postflight-assertions.sql"    "06-postflight.sql"
stage "supabase/migration-drafts/0142_revert_narrow_admin_user_update.sql" "07-revert-policy.sql"
stage "supabase/migration-drafts/0140_revert_admin_actions_journal.sql"  "08-revert-journal.sql"
stage "supabase/migration-drafts/0138_revert_admin_session_function.sql" "09-revert-session.sql"
stage "supabase/migration-drafts/0136_revert_api_column_grants.sql"      "10-revert-grants.sql"
stage "scripts/supabase/hardening-revert-assertions.sql"        "11-revert-assertions.sql"
stage "scripts/supabase/hardening-negative-controls.sql"        "12-mutation.sql"

# Роли API живут вне схемы, поэтому в дампе схемы их нет. Для режима фазы 0 их
# нужно создать до загрузки снимка, иначе GRANT-строки дампа не применятся.
cat > "$STAGE/00-roles.sql" <<'ROLES'
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','supabase_auth_admin',
                           'dashboard_user','supabase_admin','authenticator',
                           'supabase_storage_admin','pgbouncer','supabase_read_only_user',
                           'supabase_realtime_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN
    EXECUTE 'ALTER ROLE service_role BYPASSRLS';
  END IF;
END $$;
ROLES
chmod 644 "$STAGE/00-roles.sql"

cat > "$STAGE/00-live-acl-check.sql" <<'ACLCHECK'
DO $check$
BEGIN
  IF has_column_privilege('authenticated', 'public.master_profiles', 'ranking_score', 'UPDATE') THEN
    RAISE EXCEPTION 'live_acl_ranking_score_still_writable'
      USING DETAIL = 'На настоящей схеме production ranking_score остался писабельным для authenticated.';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.master_profiles', 'bio', 'UPDATE') THEN
    RAISE EXCEPTION 'live_acl_lost_required_grant'
      USING DETAIL = 'На настоящей схеме потерян нужный грант UPDATE(bio).';
  END IF;
  IF has_table_privilege('authenticated', 'public.users', 'UPDATE') THEN
    RAISE EXCEPTION 'live_acl_table_level_update_survived';
  END IF;
  RAISE NOTICE 'живая схема: ranking_score закрыт, bio открыт, табличный UPDATE снят';
END
$check$;
ACLCHECK
chmod 644 "$STAGE/00-live-acl-check.sql"

if [ -n "$LIVE_SCHEMA" ]; then
  [ -f "$LIVE_SCHEMA" ] || { echo "XTRUD_LIVE_SCHEMA_SQL: файла нет: $LIVE_SCHEMA" >&2; exit 1; }
  if ! grep -qE '^(REVOKE|GRANT) ' "$LIVE_SCHEMA"; then
    banner "ОТКАЗ: в снимке ${LIVE_SCHEMA} нет ни одной строки GRANT/REVOKE." \
      "Похоже, он снят с --no-privileges. Такая репетиция ложно-зелёная:" \
      "«заблокировано» окажется отсутствием права, а не работой защиты."
    exit 1
  fi
  if ! grep -qE '^GRANT .* TO (anon|authenticated)\b' "$LIVE_SCHEMA"; then
    banner "ОТКАЗ: в снимке нет грантов ролям anon/authenticated." \
      "Без них проверять колоночную модель бессмысленно."
    exit 1
  fi
  # Единственная строка дампа, которая не применяется к уже существующей базе.
  grep -v '^CREATE SCHEMA public;$' "$LIVE_SCHEMA" > "$STAGE/00-live-schema.sql"
  chmod 644 "$STAGE/00-live-schema.sql"
fi

NEW_DB=""
new_db() {
  NEW_DB="xtrud_hardening_$1_$$_${RANDOM}"
  DBS+=("$NEW_DB")
  as_super "createdb -p ${PORT} ${NEW_DB}"
}

run() {
  local db="$1" label="$2" file="$3"; shift 3
  echo
  echo "---- ${label} (${file}) ----"
  as_super "psql -p ${PORT} -d ${db} -X -v ON_ERROR_STOP=1 $* -f ${STAGE}/${file}"
}

# NOTICE подавляются: в фазах 3-4 одни и те же уведомления печатались бы
# десятками экранов и прятали единственную важную строку — вердикт мутации.
# Ошибки при этом остаются видимыми: client_min_messages=warning их не гасит.
run_quiet() {
  local db="$1" file="$2"; shift 2
  as_super "PGOPTIONS='-c client_min_messages=warning' psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 $* -f ${STAGE}/${file}" >/dev/null
}

run_expect_fail() {
  local db="$1" label="$2" file="$3" expect="$4"; shift 4
  echo
  echo "---- ${label} (${file}) — ОБЯЗАНА УПАСТЬ ----"
  local out status
  set +e
  out="$(as_super "psql -p ${PORT} -d ${db} -X -v ON_ERROR_STOP=1 $* -f ${STAGE}/${file}" 2>&1)"
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    echo "$out"
    echo "ПРОВАЛ: ${label} прошла, хотя обязана была быть отвергнута." >&2
    exit 1
  fi
  if [ -n "$expect" ] && ! printf '%s' "$out" | grep -qF "$expect"; then
    echo "$out"
    echo "ПРОВАЛ: ${label} отвергнута не по той причине (ожидалось: ${expect})." >&2
    exit 1
  fi
  printf '%s\n' "$out" | grep -E 'ERROR|ASSERT' | head -3
  echo "OK: отвергнута, как и требовалось."
}

banner "репетиция закалки базы (docs/ADMIN_PANEL.md §9.1, шаг 1)" \
  "PostgreSQL: ${SERVER_VERSION} (локальный, порт ${PORT})" \
  "Фазы 1-4: синтетическая фикстура с воспроизведёнными живыми грантами" \
  "Фаза 0:   ${LIVE_SCHEMA:-не запускается (XTRUD_LIVE_SCHEMA_SQL не задан)}" \
  "ВНИМАНИЕ: версия локального сервера — не версия production. Локальный успех" \
  "не заменяет репетицию на восстановленном снимке."


# ---------------------------------------------------------------------------
if [ -n "$LIVE_SCHEMA" ]; then
banner "ФАЗА 0/4 — применимость к НАСТОЯЩЕЙ схеме production." \
  "Снимок схемы не содержит строк, поэтому здесь проверяется только то, что" \
  "можно проверить без данных: применяются ли черновики, совпадает ли список" \
  "колонок, срабатывает ли сужение на живых ACL и точен ли откат."

new_db live; DB_LIVE="$NEW_DB"
as_super "PGOPTIONS='-c client_min_messages=warning' psql -p ${PORT} -d ${DB_LIVE} -X -q -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";'" >/dev/null
as_super "PGOPTIONS='-c client_min_messages=warning' psql -p ${PORT} -d ${DB_LIVE} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/00-roles.sql" >/dev/null

echo
echo "---- 0/6 загрузка снимка живой схемы (с грантами) ----"
as_super "PGOPTIONS='-c client_min_messages=warning' psql -p ${PORT} -d ${DB_LIVE} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/00-live-schema.sql"
echo "снимок загружен без ошибок"

run "$DB_LIVE" "1/6 0135 на живой схеме"        "02-grants.sql"
run "$DB_LIVE" "2/6 0137 на живой схеме"        "03-session.sql"
run "$DB_LIVE" "3/6 0139 на живой схеме"        "04-journal.sql"

# В снимке схемы нет ни одного администратора, поэтому 0141 ОБЯЗАНА отказаться:
# это её главное предусловие, а не сбой репетиции.
run_expect_fail "$DB_LIVE" "4/6 0141 на схеме без администраторов" "05-policy.sql" \
  "narrow_admin_update_no_active_administrator"

run "$DB_LIVE" "5/6 сужение сработало на живых ACL" "00-live-acl-check.sql"

run "$DB_LIVE" "6/6 откат 0136 на живой схеме" "10-revert-grants.sql"
fi

# ---------------------------------------------------------------------------
banner "ФАЗА 1/4 — предусловия. Черновики обязаны ОТКАЗАТЬСЯ."
# ---------------------------------------------------------------------------

new_db p1a; DB="$NEW_DB"
run_quiet "$DB" "01-preflight.sql"
run_expect_fail "$DB" "0139 (журнал) без 0137" "04-journal.sql" \
  "admin_actions_requires_admin_session_function"
run_expect_fail "$DB" "0141 (политика) без 0137" "05-policy.sql" \
  "narrow_admin_update_requires_admin_session_function"

new_db p1b; DB="$NEW_DB"
run_quiet "$DB" "01-preflight.sql" "-v p0130=skip"
run_quiet "$DB" "03-session.sql"
run_expect_fail "$DB" "0141 без применённой 0130" "05-policy.sql" \
  "narrow_admin_update_requires_is_admin_guard"

new_db p1c; DB="$NEW_DB"
run_quiet "$DB" "01-preflight.sql" "-v p0130=foreign"
run_quiet "$DB" "03-session.sql"
run_expect_fail "$DB" "0141 против ЧУЖОГО объекта с именем 0130" "05-policy.sql" \
  "narrow_admin_update_foreign_privilege_guard_requires_live_audit"

new_db p1d; DB="$NEW_DB"
run_quiet "$DB" "01-preflight.sql"
run_quiet "$DB" "03-session.sql"
as_super "PGOPTIONS='-c client_min_messages=warning' psql -p ${PORT} -d ${DB} -X -q -v ON_ERROR_STOP=1 -c \"DELETE FROM auth.mfa_factors\"" >/dev/null
run_expect_fail "$DB" "0141 без подтверждённого второго фактора у администратора" "05-policy.sql" \
  "narrow_admin_update_would_lock_out_moderation"

new_db p1e; DB="$NEW_DB"
run_quiet "$DB" "01-preflight.sql"
run_expect_fail "$DB" "откат 0136 без снимка ACL" "10-revert-grants.sql" \
  "api_column_grants_revert_without_baseline"

# ---------------------------------------------------------------------------
banner "ФАЗА 2/4 — применение, поведение, откат"
# ---------------------------------------------------------------------------

new_db main; DB_MAIN="$NEW_DB"
run "$DB_MAIN" "1/11 текущее состояние"                    "01-preflight.sql"
run "$DB_MAIN" "2/11 0135 колоночные гранты"               "02-grants.sql"
run "$DB_MAIN" "3/11 0137 is_admin_session()"              "03-session.sql"
run "$DB_MAIN" "4/11 0139 журнал admin_actions"            "04-journal.sql"
run "$DB_MAIN" "5/11 0141 сужение админской политики"      "05-policy.sql"
run "$DB_MAIN" "6/11 поведенческие проверки"               "06-postflight.sql"

echo
echo "---- 7/11 откат журнала с непустой историей обязан быть отвергнут ----"
run_expect_fail "$DB_MAIN" "0140 при непустом журнале" "08-revert-journal.sql" \
  "admin_actions_revert_would_destroy_history"
as_super "psql -p ${PORT} -d ${DB_MAIN} -X -q -c \"ALTER TABLE public.admin_actions DISABLE TRIGGER admin_actions_no_delete; DELETE FROM public.admin_actions; ALTER TABLE public.admin_actions ENABLE TRIGGER admin_actions_no_delete;\"" >/dev/null

run "$DB_MAIN" "8/11 откат 0142 (политика)"   "07-revert-policy.sql"
run "$DB_MAIN" "9/11 откат 0140 (журнал)"     "08-revert-journal.sql"
run "$DB_MAIN" "10/11 откат 0138 (функция)"   "09-revert-session.sql"
run "$DB_MAIN" "11/11 откат 0136 (гранты)"    "10-revert-grants.sql"
run "$DB_MAIN" "сверка эквивалентности отката" "11-revert-assertions.sql"

# ---------------------------------------------------------------------------
banner "ФАЗА 3/4 — ассерты обязаны уметь краснеть." \
  "Тот же набор проверок на НЕзакалённой базе. Если он проходит — он ничего не мерит."
# ---------------------------------------------------------------------------

new_db bare; DB_BARE="$NEW_DB"
run_quiet "$DB_BARE" "01-preflight.sql"
# только 0137/0139, чтобы проверки дошли до содержательной части, но БЕЗ 0135 и 0141
run_quiet "$DB_BARE" "03-session.sql"
run_quiet "$DB_BARE" "04-journal.sql"
run_expect_fail "$DB_BARE" "поведенческие проверки без 0135 и 0141" "06-postflight.sql" "ASSERT FAIL"

# ---------------------------------------------------------------------------
banner "ФАЗА 4/4 — негативные контроли: каждая мутация обязана быть ПОЙМАНА." \
  "${#MUTATIONS[@]} мутаций, каждая на своей свежей базе."
# ---------------------------------------------------------------------------

CAUGHT=0
MISSED=0
MISSED_NAMES=()

for mutation in "${MUTATIONS[@]}"; do
  new_db neg; db="$NEW_DB"
  run_quiet "$db" "01-preflight.sql"
  run_quiet "$db" "02-grants.sql"
  run_quiet "$db" "03-session.sql"
  run_quiet "$db" "04-journal.sql"
  run_quiet "$db" "05-policy.sql"
  as_super "PGOPTIONS='-c client_min_messages=warning' psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -v mutation=${mutation} -f ${STAGE}/12-mutation.sql" >/dev/null

  set +e
  out="$(as_super "psql -p ${PORT} -d ${db} -X -q -v ON_ERROR_STOP=1 -f ${STAGE}/06-postflight.sql" 2>&1)"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    CAUGHT=$((CAUGHT + 1))
    reason="$(printf '%s' "$out" | grep -m1 -E 'ASSERT FAIL|ERROR' | cut -c1-150)"
    printf '  ПОЙМАНА  %-46s %s\n' "$mutation" "$reason"
  else
    MISSED=$((MISSED + 1))
    MISSED_NAMES+=("$mutation")
    printf '  ПРОПУЩЕНА %-45s проверки приняли сломанный черновик\n' "$mutation"
  fi

  as_super "dropdb -p ${PORT} --if-exists ${db}" >/dev/null 2>&1 || true
done

echo
echo "негативные контроли: поймано ${CAUGHT} / пропущено ${MISSED} (всего ${#MUTATIONS[@]})"

if [ "$MISSED" -ne 0 ]; then
  banner "ПРОВАЛ: проверки не замечают эти мутации:" "${MISSED_NAMES[@]}" \
    "Ассерт, который не умеет краснеть, — не проверка."
  exit 1
fi

banner "ПРОЙДЕНО: предусловия, применение, поведение, откат," \
  "падение проверок на незакалённой базе и ${CAUGHT}/${#MUTATIONS[@]} негативных контролей." \
  "Область: синтетическая фикстура${LIVE_SCHEMA:+ + применимость к снимку $LIVE_SCHEMA}." \
  "Поведение на живых ДАННЫХ, migration ledger и репетиция восстановления" \
  "по-прежнему не проверены и продолжают блокировать продвижение."
