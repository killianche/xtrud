#!/usr/bin/env bash
# Production deploy публичных статических страниц xtrud.
#
# Продукт — iOS-приложение. Веб существует только как обязательная для App Store
# поверхность: privacy, terms, support, account deletion, сброс пароля и AASA
# для universal links. Полной Expo web-сборки больше нет, поэтому на сервер
# уезжает содержимое public/ как есть.
#
# Источник истины — Git main. Скрипт отказывается выкатывать dirty-worktree,
# другую ветку или SHA не из origin/main. На сервере предыдущий релиз остаётся
# как <remote_dir>.previous для быстрого ручного отката.

set -euo pipefail

PRODUCTION_HOST="$(node -p "require('./release/production.json').web.sshHost")"
EXPECTED_REMOTE_DIR="$(node -p "require('./release/production.json').web.remoteDir")"
PRODUCTION_DOMAINS=()
while IFS= read -r domain; do
  [[ -n "${domain}" ]] && PRODUCTION_DOMAINS+=("${domain}")
done < <(node -e 'for (const domain of require("./release/production.json").web.domains ?? []) console.log(domain)')
if [[ "${#PRODUCTION_DOMAINS[@]}" -eq 0 ]]; then
  echo "Остановлено: release/production.json не содержит production domains."
  exit 1
fi
PRODUCTION_PRIMARY_DOMAIN="${PRODUCTION_DOMAINS[0]}"

if [[ -n "${HOST+x}" && "${HOST}" != "${PRODUCTION_HOST}" ]]; then
  echo "Остановлено: разрешён только HOST=${PRODUCTION_HOST}."
  exit 1
fi
HOST="${PRODUCTION_HOST}"
REMOTE_DIR="${REMOTE_DIR:-${EXPECTED_REMOTE_DIR}}"
CONFIRM_VALUE="xtrud-production"

if [[ "${CONFIRM_DEPLOY:-}" != "${CONFIRM_VALUE}" ]]; then
  echo "Остановлено: production deploy требует CONFIRM_DEPLOY=${CONFIRM_VALUE}."
  exit 1
fi

if [[ "${REMOTE_DIR}" != "${EXPECTED_REMOTE_DIR}" ]]; then
  echo "Остановлено: разрешён только REMOTE_DIR=${EXPECTED_REMOTE_DIR}."
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Остановлено: deploy разрешён только из ветки main."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Остановлено: рабочая копия содержит незакоммиченные изменения."
  git status --short
  exit 1
fi

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
if [[ -z "${REMOTE_SHA}" || "${LOCAL_SHA}" != "${REMOTE_SHA}" ]]; then
  echo "Остановлено: локальный HEAD не совпадает с origin/main."
  echo "local=${LOCAL_SHA}"
  echo "origin=${REMOTE_SHA:-unavailable}"
  exit 1
fi

echo "-> Публичные страницы: контракт App Store..."
node scripts/release/check-public-legal-pages.mjs

STAGE_LOCAL="$(mktemp -d /tmp/xtrud-static.XXXXXX)"
ARCHIVE="$(mktemp /tmp/xtrud-static.XXXXXX.tgz)"
REMOTE_ARCHIVE="/tmp/xtrud-static-${LOCAL_SHA}.tgz"
trap 'rm -rf "${STAGE_LOCAL}" "${ARCHIVE}"' EXIT

cp -R public/. "${STAGE_LOCAL}/"
LOCAL_SHA="${LOCAL_SHA}" node -e '
  const fs = require("node:fs");
  fs.writeFileSync(
    `${process.argv[1]}/release.json`,
    `${JSON.stringify(
      {
        surface: "static-public",
        gitSha: process.env.LOCAL_SHA,
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
' "${STAGE_LOCAL}"

# Список страниц выводится из содержимого public/, а не хардкодится: добавленная
# страница автоматически попадает в live smoke-check.
PAGE_PATHS=()
while IFS= read -r page; do
  PAGE_PATHS+=("${page}")
# Корневой index.html даёт пустой путь (страница «домен/»). До 2026-09-10 здесь
# снимался только «/index.html», и корень превращался в «index.html» —
# проверка шла по адресу «домен/index.html/», получала 404 и откатывала
# каждую выкладку с тех пор, как 2026-09-01 появилась главная.
done < <(cd "${STAGE_LOCAL}" && find . -name index.html | sed 's|^\./||; s|/\{0,1\}index\.html$||' | sort)

echo "-> Упаковка ${LOCAL_SHA:0:12} без macOS-метаданных..."
COPYFILE_DISABLE=1 tar --no-xattrs -czf "${ARCHIVE}" -C "${STAGE_LOCAL}" .

echo "-> Загрузка на ${HOST}..."
scp "${ARCHIVE}" "${HOST}:${REMOTE_ARCHIVE}"

echo "-> Атомарная подмена релиза..."
ssh "${HOST}" "bash -s -- '${REMOTE_DIR}' '${REMOTE_ARCHIVE}' '${LOCAL_SHA}'" <<'REMOTE_SCRIPT'
set -euo pipefail

remote_dir="$1"
archive="$2"
sha="$3"

if [[ "${remote_dir}" != "/var/www/xtrud" ]]; then
  echo "Unsafe remote_dir: ${remote_dir}" >&2
  exit 1
fi
if [[ "${archive}" != /tmp/xtrud-static-*.tgz ]]; then
  echo "Unsafe archive path: ${archive}" >&2
  exit 1
fi

stage="${remote_dir}.next-${sha:0:12}"
previous="${remote_dir}.previous"

cleanup_remote_temp() {
  rm -f "${archive}"
  if [[ -d "${stage}" ]]; then
    rm -rf "${stage}"
  fi
}
trap cleanup_remote_temp EXIT

rm -rf "${stage}"
mkdir -p "${stage}"
tar -xzf "${archive}" -C "${stage}"

# Обязательные для App Store артефакты должны существовать до подмены.
test -s "${stage}/release.json"
test -s "${stage}/privacy/index.html"
test -s "${stage}/terms/index.html"
test -s "${stage}/support/index.html"
test -s "${stage}/account-deletion/index.html"
test -s "${stage}/legal.css"
test -s "${stage}/.well-known/apple-app-site-association"

release_sha="$(sed -n 's/.*"gitSha": "\([^"]*\)".*/\1/p' "${stage}/release.json")"
if [[ "${release_sha}" != "${sha}" ]]; then
  echo "Refusing release with mismatched gitSha" >&2
  rm -rf "${stage}"
  exit 1
fi

chown -R www-data:www-data "${stage}"
rm -rf "${previous}"
if [[ -d "${remote_dir}" ]]; then
  mv "${remote_dir}" "${previous}"
fi

if ! mv "${stage}" "${remote_dir}"; then
  [[ -d "${previous}" ]] && mv "${previous}" "${remote_dir}"
  exit 1
fi

REMOTE_SCRIPT

echo "-> Live smoke-check..."
LIVE_VALID=true
for domain in "${PRODUCTION_DOMAINS[@]}"; do
  if ! curl --fail --silent --show-error --max-time 20 "${domain}/release.json?sha=${LOCAL_SHA}" |
    EXPECTED_SHA="${LOCAL_SHA}" node -e '
      const fs = require("node:fs");
      const release = JSON.parse(fs.readFileSync(0, "utf8"));
      if (release.gitSha !== process.env.EXPECTED_SHA || release.surface !== "static-public") {
        throw new Error(`Live release mismatch: ${JSON.stringify(release)}`);
      }
    '; then
    LIVE_VALID=false
    break
  fi

  for page in "${PAGE_PATHS[@]}"; do
    # Корневая страница — пустой путь: адрес «домен/», а не «домен//».
    page_url="${domain}/${page:+${page}/}"
    if ! curl --fail --silent --show-error --max-time 20 --output /dev/null "${page_url}"; then
      echo "Страница недоступна: ${page_url}" >&2
      LIVE_VALID=false
      break 2
    fi
  done

  # AASA обязан отдаваться как application/json, иначе universal links молча
  # ломаются и сброс пароля перестаёт открывать приложение.
  AASA_TYPE="$(curl --fail --silent --show-error --max-time 20 \
    --output /dev/null --write-out '%{content_type}' \
    "${domain}/.well-known/apple-app-site-association")" || AASA_TYPE=""
  if [[ "${AASA_TYPE}" != application/json* ]]; then
    echo "AASA отдаётся с Content-Type='${AASA_TYPE}', ожидается application/json" >&2
    LIVE_VALID=false
    break
  fi
  if ! curl --fail --silent --show-error --max-time 20 \
    "${domain}/.well-known/apple-app-site-association" |
    node -e 'JSON.parse(require("node:fs").readFileSync(0, "utf8"));'; then
    echo "AASA не является валидным JSON на ${domain}" >&2
    LIVE_VALID=false
    break
  fi
done

if [[ "${LIVE_VALID}" != "true" ]]; then
  echo "Live smoke-check провалился; восстанавливаю предыдущий релиз..." >&2
  ssh "${HOST}" "bash -s -- '${REMOTE_DIR}' '${LOCAL_SHA}'" <<'ROLLBACK_SCRIPT'
set -euo pipefail
remote_dir="$1"
sha="$2"
if [[ "${remote_dir}" != "/var/www/xtrud" ]]; then
  echo "Unsafe rollback remote_dir: ${remote_dir}" >&2
  exit 1
fi
previous="${remote_dir}.previous"
failed="${remote_dir}.failed-${sha:0:12}"
test -d "${previous}"
rm -rf "${failed}"
mv "${remote_dir}" "${failed}"
mv "${previous}" "${remote_dir}"
rm -rf "${failed}"
ROLLBACK_SCRIPT
  echo "Предыдущий релиз восстановлен." >&2
  exit 1
fi

echo "Выкачено ${LOCAL_SHA:0:12}: ${PRODUCTION_PRIMARY_DOMAIN}/"
for page in "${PAGE_PATHS[@]}"; do
  echo "  ${PRODUCTION_PRIMARY_DOMAIN}/${page:+${page}/}"
done
