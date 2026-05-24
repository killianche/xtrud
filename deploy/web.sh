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

echo "→ Building Expo web bundle..."
rm -rf dist
# Demo-вход (телефоны +79000… → email/пароль 'xtrud') ВКЛЮЧЁН: xtrud.alanbani.ru —
# это демо/превью-площадка, на которую владелец заходит тестовыми аккаунтами и
# админом (+7 900 000-00-99), см. DEMO_ACCOUNTS.md. Перед РЕАЛЬНЫМ публичным
# запуском (реальные пользователи) — убрать EXPO_PUBLIC_ENABLE_DEMO, иначе любой
# сможет войти под demo-аккаунтом с паролем 'xtrud'.
# --clear: сброс Metro-кэша, иначе флаг может заинлайниться из старого кэша как false.
EXPO_PUBLIC_ENABLE_DEMO=true npx expo export --platform web --clear

# Деплой на корень subdomain (xtrud.alanbani.ru) — absolute paths в HTML
# (`/_expo/...`, `/favicon.ico`) работают как есть, baseUrl-патч не нужен.

# ⚠️ ОБЯЗАТЕЛЬНЫЙ ПАТЧ для Expo SDK 54: bundle содержит `import.meta`
# который требует ES-module-загрузки, но `expo export` пишет
# `<script src="..." defer>` без `type="module"`. Браузер парсит как
# classic script → SyntaxError → ВЕСЬ bundle тихо отказывает, белый
# экран, ноль ошибок в console. Лечится post-process'ом.
# Та же история что для local preview (см. scripts/build-web-local.mjs).
echo "→ Patching dist/index.html (script type=module для SDK 54)..."
sed -i.bak -E 's|<script ([^>]*src="/_expo/[^"]+"[^>]*)defer></script>|<script type="module" \1defer></script>|g' dist/index.html
rm dist/index.html.bak

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
