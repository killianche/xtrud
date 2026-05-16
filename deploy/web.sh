#!/usr/bin/env bash
# Web deploy на VPS alanskie-bani (62.113.106.30) → https://xtrud.alanbani.ru/
#
# Что делает:
#   1. expo export --platform web  → dist/
#   2. tar + scp в /tmp на сервере
#   3. распаковка в /var/www/xtrud + chown www-data
#   4. удаление tmp
#
# Caddy: блок `xtrud.alanbani.ru { root * /var/www/xtrud ... }` в /etc/caddy/Caddyfile.
# Старый /xtrud/* subpath на alanbani.ru → 301-redirect на subdomain (для legacy ссылок).
# Если изменишь Caddy — не забудь `ssh root@HOST 'systemctl reload caddy'`.
#
# Когда мигрируем на Vercel/CF Pages (план из CLAUDE.md) — этот скрипт удалить.

set -euo pipefail

HOST="${HOST:-root@62.113.106.30}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/xtrud}"

echo "→ Building Expo web bundle..."
rm -rf dist
npx expo export --platform web

# Деплой на корень subdomain (xtrud.alanbani.ru) — absolute paths в HTML
# (`/_expo/...`, `/favicon.ico`) работают как есть, патч не нужен.
# (раньше был sed-patch /xtrud/ префикса для subpath alanbani.ru/xtrud/ —
#  убран 2026-05-16 после переезда на subdomain).

echo "→ Packing..."
tar czf /tmp/xtrud-dist.tgz -C dist .

echo "→ Uploading to ${HOST}..."
scp /tmp/xtrud-dist.tgz "${HOST}":/tmp/

echo "→ Extracting on remote..."
ssh "${HOST}" "
  rm -rf ${REMOTE_DIR}/* ${REMOTE_DIR}/.[!.]*
  tar xzf /tmp/xtrud-dist.tgz -C ${REMOTE_DIR}
  chown -R www-data:www-data ${REMOTE_DIR}
  rm /tmp/xtrud-dist.tgz
"

rm /tmp/xtrud-dist.tgz

echo ""
echo "✓ Deployed: https://xtrud.alanbani.ru/"
