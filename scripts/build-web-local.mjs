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

console.log("→ Patching dist/index.html (script + safe-area meta-tags)...");
let html = readFileSync(INDEX, "utf-8");
const before = html;

// 1) <script defer> → type="module" — обход SDK 54 import.meta-бага (см. выше).
html = html.replace(
  /<script src="([^"]+)" defer><\/script>/g,
  '<script src="$1" type="module"></script>',
);

// 2) viewport — viewport-fit=cover нужен для iPhone notch (env(safe-area-inset-*)).
//    Без этого web на iOS Safari игнорирует safe-area, контент лезет под notch.
html = html.replace(
  /<meta name="viewport" content="[^"]*"\s*\/?>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
);

// 3) theme-color + apple status-bar + html/body фон.
//    - theme-color: Safari iOS красит address-bar / notch-area в этот цвет.
//      Без него на тёмной теме сверху белая полоса.
//    - apple-mobile-web-app-status-bar-style: для standalone PWA.
//    - html/body fill: заходит за safe-area при overscroll bounce (pull-down).
//    Expo Router output:"single" пропускает +html.tsx — поэтому правим тут.
const safeAreaMetas = [
  '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />',
  '<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<style id="xtrud-safe-area">html,body{background-color:#ffffff}@media (prefers-color-scheme:dark){html,body{background-color:#0a0a0a}}</style>',
].join("\n    ");
html = html.replace("</head>", `    ${safeAreaMetas}\n  </head>`);

if (html === before) {
  console.warn("⚠ Не нашёл что патчить в index.html. Проверь руками.");
} else {
  writeFileSync(INDEX, html, "utf-8");
  console.log("✓ index.html пропатчен (script + safe-area metas)");
}

console.log("\n✓ Готово. Сервить локально:");
console.log("    npm run web:serve");
console.log("  Откроется на http://localhost:8082/");
