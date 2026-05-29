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
# Cache headers (важно!): xtrud-блок Caddy ставит `Cache-Control: no-cache,
# must-revalidate` на index.html (и SPA-fallback) и `immutable` на хешированные
# ассеты. Эффект: пользователи получают обновления СРАЗУ после deploy, без
# очистки кэша. Источник истины — `deploy/Caddyfile.xtrud.example` (snippet
# для копирования). Если случайно сломаешь cache headers — рестарт деплоев
# перестанет доходить до клиентов.
#
# Когда мигрируем на Vercel/CF Pages (план из CLAUDE.md) — этот скрипт удалить.

set -euo pipefail

HOST="${HOST:-root@62.113.106.30}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/xtrud}"

echo "→ Building Expo web bundle (через scripts/build-web-local.mjs)..."
# Единый источник истины сборки — scripts/build-web-local.mjs (тот же, что для
# local preview). Он делает: rm -rf dist → expo export (EXPO_PUBLIC_ENABLE_DEMO=
# true, --clear) → ПОЛНЫЙ патч index.html:
#   - <script ... defer> → type="module"  (обход SDK 54 import.meta-бага);
#   - safe-area meta (viewport-fit, theme-color, apple status-bar);
#   - theme-guard script (без мигания темы при «Авто»);
#   - адаптивный SVG-фавикон <link rel=icon> (public/favicon.svg).
# Раньше web.sh делал свой урезанный export + только script-патч — из-за этого
# на прод не попадали фавикон/тема/safe-area. Теперь расхождения нет.
#
# Demo-вход (телефоны +79000… → email/пароль 'xtrud') ВКЛЮЧЁН внутри скрипта:
# xtrud.alanbani.ru — демо/превью-площадка (тест-аккаунты + админ
# +7 900 000-00-99, см. DEMO_ACCOUNTS.md). Перед РЕАЛЬНЫМ публичным запуском —
# убрать EXPO_PUBLIC_ENABLE_DEMO из build-web-local.mjs, иначе любой войдёт под
# demo-аккаунтом с паролем 'xtrud'.
node scripts/build-web-local.mjs

# Деплой на корень subdomain (xtrud.alanbani.ru) — absolute paths в HTML
# (`/_expo/...`, `/favicon.ico`, `/favicon.svg`) работают как есть.

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
