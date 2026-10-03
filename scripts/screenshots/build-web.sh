#!/bin/bash
# Веб-сборка xtrud для снимков экранов (навык .claude/skills/xtrud-screenshots).
# Использование: scripts/screenshots/build-web.sh <папка-вывода>
# Адрес API — публичный, из release/production.json. Секретов не нужно.
set -euo pipefail
OUT="$(mkdir -p "$1" && cd "$1" && pwd)/web-dist"
cd "$(dirname "$0")/../.."
API=$(node -e "console.log(require('./release/production.json').backend.url)")
rm -rf "$OUT"
EXPO_PUBLIC_API_URL="$API" EXPO_PUBLIC_SUPABASE_URL="$API" \
  npx expo export -p web --output-dir "$OUT" > "$OUT.log" 2>&1
# public/index.html — статический лендинг сайта, он подменяет index.html
# приложения. Для снимков нужна оболочка SPA с бандлом.
node -e '
const fs = require("fs"), path = require("path");
const out = process.argv[1];
const js = fs.readdirSync(path.join(out, "_expo/static/js/web"));
const css = fs.existsSync(path.join(out, "_expo/static/css")) ? fs.readdirSync(path.join(out, "_expo/static/css")) : [];
fs.writeFileSync(path.join(out, "app.html"),
  `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  css.map((c) => `<link rel="stylesheet" href="/_expo/static/css/${c}">`).join("") +
  `<style>html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div>` +
  js.map((j) => `<script src="/_expo/static/js/web/${j}" defer></script>`).join("") + `</body></html>`);
' "$OUT"
echo "$OUT"
