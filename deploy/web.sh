#!/usr/bin/env bash
# Production web deploy: clean main -> production export -> staged VPS swap.
#
# Источник истины сайта — Git main. Скрипт намеренно отказывается выкатывать
# dirty-worktree, другую ветку, SHA не из origin/main или demo-bundle. На VPS
# хранится только производный export; предыдущий релиз сохраняется как
# /var/www/xtrud.previous для быстрого ручного отката.

set -euo pipefail

PRODUCTION_HOST="$(node -p "require('./release/production.json').web.sshHost")"
EXPECTED_REMOTE_DIR="$(node -p "require('./release/production.json').web.remoteDir")"
EXPECTED_BACKEND_URL="$(node -p "require('./release/production.json').backend.url")"
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

ARCHIVE="$(mktemp /tmp/xtrud-dist.XXXXXX.tgz)"
REMOTE_ARCHIVE="/tmp/xtrud-${LOCAL_SHA}.tgz"
trap 'rm -f "${ARCHIVE}"' EXIT

echo "-> Full release gate + production web build (no deploy side effects)..."
npm run release:check

LOCAL_SHA="${LOCAL_SHA}" EXPECTED_BACKEND_URL="${EXPECTED_BACKEND_URL}" node -e '
  const release = require("./dist/release.json");
  if (
    release.buildMode !== "production" ||
    release.demoEnabled !== false ||
    release.demoDataVisible !== false ||
    release.gitDirty !== false ||
    release.gitSha !== process.env.LOCAL_SHA ||
    release.backendUrl !== process.env.EXPECTED_BACKEND_URL
  ) {
    throw new Error(`Unsafe release manifest: ${JSON.stringify(release)}`);
  }
'

echo "-> Packing ${LOCAL_SHA:0:12} without macOS AppleDouble metadata..."
COPYFILE_DISABLE=1 tar -czf "${ARCHIVE}" -C dist .

echo "-> Uploading staged release to ${HOST}..."
scp "${ARCHIVE}" "${HOST}:${REMOTE_ARCHIVE}"

echo "-> Swapping release on VPS..."
ssh "${HOST}" "bash -s -- '${REMOTE_DIR}' '${REMOTE_ARCHIVE}' '${LOCAL_SHA}' '${EXPECTED_BACKEND_URL}'" <<'REMOTE_SCRIPT'
set -euo pipefail

remote_dir="$1"
archive="$2"
sha="$3"
backend_url="$4"

if [[ "${remote_dir}" != "/var/www/xtrud" ]]; then
  echo "Unsafe remote_dir: ${remote_dir}" >&2
  exit 1
fi
if [[ "${archive}" != /tmp/xtrud-*.tgz ]]; then
  echo "Unsafe archive path: ${archive}" >&2
  exit 1
fi

stage="${remote_dir}.next-${sha:0:12}"
previous="${remote_dir}.previous"

cleanup_remote_temp() {
  rm -f "${archive}"
  [[ -d "${stage}" ]] && rm -rf "${stage}"
}
trap cleanup_remote_temp EXIT

rm -rf "${stage}"
mkdir -p "${stage}"
tar -xzf "${archive}" -C "${stage}"
test -s "${stage}/index.html"
test -s "${stage}/release.json"

release_demo="$(sed -n 's/.*"demoEnabled": \(true\|false\).*/\1/p' "${stage}/release.json")"
release_demo_data="$(sed -n 's/.*"demoDataVisible": \(true\|false\).*/\1/p' "${stage}/release.json")"
release_mode="$(sed -n 's/.*"buildMode": "\([^"]*\)".*/\1/p' "${stage}/release.json")"
release_sha="$(sed -n 's/.*"gitSha": "\([^"]*\)".*/\1/p' "${stage}/release.json")"
release_backend="$(sed -n 's/.*"backendUrl": "\([^"]*\)".*/\1/p' "${stage}/release.json")"
if [[ "${release_demo}" != "false" || "${release_demo_data}" != "false" || "${release_mode}" != "production" || "${release_sha}" != "${sha}" || "${release_backend}" != "${backend_url}" ]]; then
  echo "Refusing non-production or demo release" >&2
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

LIVE_VALID=true
for domain in "${PRODUCTION_DOMAINS[@]}"; do
  if ! curl --fail --silent --show-error --max-time 20 "${domain}/release.json?sha=${LOCAL_SHA}" |
    EXPECTED_SHA="${LOCAL_SHA}" EXPECTED_BACKEND_URL="${EXPECTED_BACKEND_URL}" node -e '
      const fs = require("node:fs");
      const release = JSON.parse(fs.readFileSync(0, "utf8"));
      if (
        release.gitSha !== process.env.EXPECTED_SHA ||
        release.backendUrl !== process.env.EXPECTED_BACKEND_URL ||
        release.buildMode !== "production" ||
        release.demoEnabled !== false ||
        release.demoDataVisible !== false
      ) throw new Error(`Live release mismatch: ${JSON.stringify(release)}`);
    '; then
    LIVE_VALID=false
    break
  fi
done

if [[ "${LIVE_VALID}" != "true" ]]; then
  echo "Live smoke-check failed; restoring previous release..." >&2
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
  echo "Previous release restored after smoke-check failure." >&2
  exit 1
fi

echo "Deployed ${LOCAL_SHA:0:12}: ${PRODUCTION_PRIMARY_DOMAIN}/"
