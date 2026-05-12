#!/usr/bin/env bash
# Sprint 17 — Web deploy на VPS alanskie-bani (62.113.106.30).
#
# Что делает:
#   1. expo export --platform web  → dist/  (с baseUrl="/xtrud")
#   2. tar + scp в /tmp на сервере
#   3. распаковка в /var/www/xtrud + chown www-data
#   4. удаление tmp
#
# Caddy уже знает про /xtrud/* (handle_path в /etc/caddy/Caddyfile).
# Если изменишь Caddy — не забудь `ssh root@HOST 'caddy reload'`.
#
# Когда мигрируем на Vercel/CF Pages (план из CLAUDE.md) — этот скрипт удалить.

set -euo pipefail

HOST="${HOST:-root@62.113.106.30}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/xtrud}"

echo "→ Building Expo web bundle..."
rm -rf dist
npx expo export --platform web

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
echo "✓ Deployed: https://alanbani.ru/xtrud/"
