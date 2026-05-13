#!/usr/bin/env node
/*
 * build-web-local.mjs — production-сборка для локального web-preview.
 *
 * Делает то, чего НЕ делает `expo export --platform web` из коробки:
 *   1. Запускает `npx expo export --platform web` (фолбэк на rm -rf dist + export).
 *   2. Патчит dist/index.html → меняет `<script ... defer>` на `<script ... type="module">`.
 *
 * Зачем патч: Expo SDK 54 web bundle содержит `import.meta` ссылки (Metro
 * Hermes-stable transform profile). Браузер выполняет classic `<script>` как
 * NON-module и встречает `import.meta` → SyntaxError → весь bundle отказывает
 * выполниться → React не монтируется. С `type="module"` ESM-синтаксис валидный
 * и bundle стартует нормально.
 *
 * Это известный баг SDK 54 (https://github.com/expo/expo/issues/...). Когда
 * Expo это починит, скрипт можно упростить до простого `npx expo export`.
 *
 * Запуск:   npm run web:build
 * Сервить:  npm run web:serve   (использует `npx serve dist -p 8082 -s`)
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const INDEX = resolve(ROOT, "dist/index.html");

console.log("→ Cleaning dist/...");
execSync("rm -rf dist", { cwd: ROOT, stdio: "inherit" });

console.log("→ Running expo export...");
execSync("npx expo export --platform web", { cwd: ROOT, stdio: "inherit" });

console.log("→ Patching dist/index.html (<script defer> → type=\"module\")...");
let html = readFileSync(INDEX, "utf-8");
const before = html;
html = html.replace(
  /<script src="([^"]+)" defer><\/script>/g,
  '<script src="$1" type="module"></script>',
);
if (html === before) {
  console.warn("⚠ Не нашёл <script src='...' defer> для патча. Проверь dist/index.html руками.");
} else {
  writeFileSync(INDEX, html, "utf-8");
  console.log("✓ index.html пропатчен");
}

console.log("\n✓ Готово. Сервить локально:");
console.log("    npm run web:serve");
console.log("  Откроется на http://localhost:8082/");
