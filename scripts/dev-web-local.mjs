#!/usr/bin/env node
/*
 * dev-web-local.mjs — watch-режим для локального web-preview.
 *
 * Запуск: npm run web:dev
 *
 * Что делает:
 *   1. Первичный build (expo export + sed-патч → dist/).
 *   2. Стартует `npx serve dist -p 8082 -s` фоном.
 *   3. Watch'ит файлы исходников (app/, src/, global.css, tailwind.config.ts,
 *      app.json) — на каждое изменение пересобирает в STAGING-папку dist_next,
 *      затем атомарно свопает dist_next → dist и рестартит serve.
 *   4. В браузере достаточно сделать F5 чтобы увидеть обновлённый bundle.
 *
 * Почему staged-сборка + рестарт serve (фикс бага «Index of dist/»):
 *   `serve` делает chdir внутрь обслуживаемой папки. Раньше пересборка делала
 *   `rm -rf dist` под живым serve → его рабочая директория исчезала → он терял
 *   cwd и начинал отдавать ЛИСТИНГ КАТАЛОГА («Index of dist/») вместо приложения.
 *   Теперь сборка идёт в dist_next (serve продолжает отдавать старый dist без
 *   простоя), а после сборки — быстрый своп + рестарт serve на свежую папку.
 *   Окно недоступности — только ~1с на своп, а не на всю сборку.
 *
 * Зачем не expo start --web:
 *   Expo SDK 54 web dev-сервер ломает hydration (Hermes-stable Metro transform
 *   → `import.meta` в classic script → SyntaxError). Production-сборка с
 *   sed-патчем `<script type="module">` единственный надёжный путь сейчас.
 *
 * NOTE: hot-reload в браузере не делаем — потребует injection client-side
 * WebSocket reload-скрипта в index.html, что добавит сложности. F5 проще.
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, statSync, watch } from "node:fs";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Папки/файлы — watch на изменение.
const WATCH_PATHS = [
  "app",
  "src",
  "assets", // картинки/иллюстрации — чтобы замена фото авто-пересобирала preview
  "global.css",
  "tailwind.config.ts",
  "app.json",
  "babel.config.js",
];

// Игнор: node_modules, dist, .expo, скрытые папки.
const IGNORE = /^(node_modules|dist(_next)?|\.expo|\.git|\.claude|legacy|vercel|tests-e2e|\.maestro)$/;

let isBuilding = false;
let buildQueued = false;
/** Ссылка на текущий дочерний процесс `serve`. Нужна, чтобы рестартить его при
 *  каждой пересборке и отличать намеренный kill (при свопе) от падения. */
let serverProc = null;

function runBuild() {
  if (isBuilding) {
    buildQueued = true;
    return;
  }
  isBuilding = true;
  console.log("\n→ Rebuild (staged)...");
  try {
    // 1. Собираем в staging-папку dist_next. Живой `serve` всё это время
    //    продолжает отдавать СТАРЫЙ dist — никакого простоя во время сборки.
    //    WEB_SKIP_CLEAR=1 — НЕ чистим Metro-кэш на пересборках (его уже прогрел
    //    initial build с --clear) → пересборка за секунды вместо ~33с cold-build.
    execSync("node scripts/build-web-local.mjs", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, WEB_OUTPUT_DIR: "dist_next", WEB_SKIP_CLEAR: "1" },
    });
    // 2. Гасим serve (он chdir'нут в старый dist), атомарно подменяем папку,
    //    поднимаем свежий serve на новый dist. Окно недоступности ~1с — только
    //    на своп+рестарт, а не на всю (долгую) сборку.
    killServer();
    execSync("rm -rf dist && mv dist_next dist", { cwd: ROOT, stdio: "inherit" });
    startServer();
    console.log("✓ Rebuild ok — нажми F5 в браузере на http://localhost:8082/\n");
  } catch (e) {
    console.error("✗ Rebuild failed:", e?.message ?? e);
    // Подчищаем staging и гарантируем, что serve поднят (на старом dist, если
    // своп не случился; на новом — если упало уже после свопа).
    try {
      execSync("rm -rf dist_next", { cwd: ROOT, stdio: "ignore" });
    } catch {
      // ignore
    }
    if (!serverProc) startServer();
  }
  isBuilding = false;
  if (buildQueued) {
    buildQueued = false;
    runBuild();
  }
}

/** Рекурсивный watch с фильтрацией. */
function watchRecursive(path) {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (!stat.isDirectory()) {
    watch(path, () => triggerBuild(path));
    return;
  }
  // node:fs `watch` поддерживает recursive только на macOS/Windows. Используем.
  watch(path, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.includes("node_modules") || filename.startsWith(".")) return;
    triggerBuild(`${path}/${filename}`);
  });
}

let lastBuildAt = 0;
function triggerBuild(why) {
  const now = Date.now();
  if (now - lastBuildAt < 500) return; // дебаунс на быстрые серии изменений
  lastBuildAt = now;
  console.log(`  changed: ${why}`);
  // Небольшая задержка чтобы editor закончил writes.
  setTimeout(runBuild, 300);
}

function startServer() {
  console.log("→ Starting `npx serve dist -p 8082 -s`...");
  const server = spawn("npx", ["serve", "dist", "-p", "8082", "-s"], {
    cwd: ROOT,
    stdio: "inherit",
    detached: false,
  });
  // Падение serve = выходим, НО только если это АКТУАЛЬНЫЙ сервер. При пересборке
  // мы намеренно убиваем старый serve через killServer(), который обнуляет
  // serverProc раньше, чем прилетит exit старого процесса — тогда
  // `server !== serverProc`, и watch-процесс НЕ падает.
  server.on("exit", (code) => {
    if (server !== serverProc) return; // намеренно убитый старый serve — игнор
    console.log(`\n[serve] exit ${code}, останавливаю watch.`);
    process.exit(code ?? 0);
  });
  serverProc = server;
  return server;
}

/** Намеренно гасим текущий serve перед свопом папки. serverProc обнуляем СРАЗУ,
 *  чтобы exit-handler старого процесса стал no-op (см. startServer). */
function killServer() {
  if (!serverProc) return;
  const old = serverProc;
  serverProc = null;
  try {
    old.kill("SIGTERM");
  } catch {
    // already dead
  }
}

function main() {
  // 1. Первичный build.
  console.log("→ Initial build...");
  execSync("node scripts/build-web-local.mjs", { cwd: ROOT, stdio: "inherit" });

  // 2. Старт сервера.
  startServer();

  // 3. Watch.
  console.log(`\n→ Watching: ${WATCH_PATHS.join(", ")}`);
  console.log("  (Ctrl+C — стоп)\n");
  for (const p of WATCH_PATHS) {
    const full = join(ROOT, p);
    watchRecursive(full);
  }
}

main();
