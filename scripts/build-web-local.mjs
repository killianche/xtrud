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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Папка вывода. По умолчанию `dist` (prod-сборка + initial build watcher'а).
// Watcher в dev-режиме передаёт WEB_OUTPUT_DIR=dist_next, чтобы собирать в
// staging-папку, пока живой `serve` продолжает отдавать старый `dist` (без
// простоя). Затем dev-web-local.mjs делает атомарный своп dist_next → dist и
// рестартит serve. Это устраняет баг «Index of dist/»: раньше rm -rf dist
// сносил папку, в которую `serve` сделал chdir, и он отдавал листинг каталога.
const OUT = process.env.WEB_OUTPUT_DIR || "dist";
const INDEX = resolve(ROOT, OUT, "index.html");

console.log(`→ Cleaning ${OUT}/...`);
execSync(`rm -rf ${OUT}`, { cwd: ROOT, stdio: "inherit" });

// --clear сбрасывает Metro transform-кэш. Он НУЖЕН только на первой сборке
// сессии (иначе EXPO_PUBLIC_ENABLE_DEMO может заинлайниться из чужого кэша как
// false и demo-вход не заработает). Но --clear НА КАЖДУЮ сборку = каждый раз
// cold-build всех ~6500 модулей (~27-33с) — из-за этого превью «долго стартует».
//
// Оптимизация 2026-05-29: чистим кэш ТОЛЬКО когда demo-флаг реально изменился
// с прошлой сборки (Metro не инвалидирует кэш при смене env, поэтому маркер
// нужен для корректности инлайна). Иначе — тёплый кэш и старт за ~3-5с.
//   WEB_SKIP_CLEAR=1 — пересборки watcher'а: никогда не чистим.
//   WEB_CLEAR=1      — принудительный сброс (escape hatch; deploy/web.sh его
//                      ставит, чтобы прод всегда собирался «начисто»).
//   иначе (старт превью) — чистим только если маркер ≠ текущий флаг (первый
//                          запуск / сменился флаг).
const DEMO_FLAG = "true"; // build-web-local всегда собирает demo-площадку
const MARKER = resolve(ROOT, ".expo", "web-build-demo-flag");
let needClear;
if (process.env.WEB_SKIP_CLEAR === "1") {
  needClear = false;
} else if (process.env.WEB_CLEAR === "1") {
  needClear = true;
} else {
  const prev = existsSync(MARKER) ? readFileSync(MARKER, "utf-8").trim() : null;
  needClear = prev !== DEMO_FLAG;
}
const clearFlag = needClear ? "--clear " : "";

console.log(
  `→ Running expo export → ${OUT}${needClear ? " (--clear, cold ~27с)" : " (тёплый кэш ~3-5с)"}...`,
);
// Демо-вход (телефоны +79000… → email/пароль 'xtrud') нужен для локального
// preview: тестовые аккаунты + админ (+7 900 000-00-99). Форсим флаг явно.
execSync(`npx expo export --platform web ${clearFlag}--output-dir ${OUT}`, {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_ENABLE_DEMO: DEMO_FLAG },
});

// Запоминаем, с каким demo-флагом собрали — чтобы следующий старт превью НЕ
// чистил кэш зря (см. needClear выше). Маркер в .expo/ (gitignored, per-machine).
try {
  mkdirSync(resolve(ROOT, ".expo"), { recursive: true });
  writeFileSync(MARKER, DEMO_FLAG, "utf-8");
} catch {
  // .expo недоступен — не критично, в худшем случае следующий старт чистит кэш.
}

console.log(`→ Patching ${OUT}/index.html (script + safe-area meta-tags)...`);
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

// 3) theme-color + apple status-bar + html/body фон + theme-guard.
//    - theme-color: Safari iOS красит address-bar / notch-area в этот цвет.
//      Без него на тёмной теме сверху белая полоса.
//    - apple-mobile-web-app-status-bar-style: для standalone PWA.
//    - html/body fill: заходит за safe-area при overscroll bounce (pull-down).
//    - theme-guard script: читает localStorage('xtrud-theme') до первого рендера
//      и ставит class="dark" на <html>, если preference=dark ИЛИ preference=system
//      и system=dark. Без него режим «Авто» не подхватывает системную тему —
//      на старте всегда видна светлая (баг до 2026-05-27).
//    Expo Router output:"single" пропускает +html.tsx — поэтому правим тут.
const themeGuardScript = `<script>(function(){try{var raw=localStorage.getItem('xtrud-theme');var pref='system';if(raw){var parsed=JSON.parse(raw);pref=(parsed&&parsed.state&&parsed.state.preference)||'system';}var sysDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(pref==='dark'||(pref==='system'&&sysDark))document.documentElement.classList.add('dark');}catch(_){}})();</script>`;
const safeAreaMetas = [
  // Адаптивный SVG-фавикон: только логотип на прозрачном фоне, цвет меняется
  // по теме (тёмный в светлой, белый в тёмной — prefers-color-scheme внутри
  // самого SVG, файл public/favicon.svg). Инжектим здесь, потому что Expo
  // static-render выкидывает кастомный rel="icon" из +html.tsx и подставляет
  // свой /favicon.ico. Браузеры предпочитают SVG-иконку поверх .ico-фолбэка.
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
  '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />',
  '<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<style id="xtrud-safe-area">html,body{background-color:#ffffff}@media (prefers-color-scheme:dark){html,body{background-color:#0a0a0a}}</style>',
  themeGuardScript,
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
