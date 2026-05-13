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
 *      app.json) — на каждое изменение пересобирает dist/.
 *   4. Сервер остаётся живым; в браузере достаточно сделать F5 чтобы увидеть
 *      обновлённый bundle.
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
  "global.css",
  "tailwind.config.ts",
  "app.json",
  "babel.config.js",
];

// Игнор: node_modules, dist, .expo, скрытые папки.
const IGNORE = /^(node_modules|dist|\.expo|\.git|\.claude|legacy|vercel|tests-e2e|\.maestro)$/;

let isBuilding = false;
let buildQueued = false;

function runBuild() {
  if (isBuilding) {
    buildQueued = true;
    return;
  }
  isBuilding = true;
  console.log("\n→ Rebuild...");
  try {
    execSync("node scripts/build-web-local.mjs", { cwd: ROOT, stdio: "inherit" });
    console.log("✓ Rebuild ok — нажми F5 в браузере на http://localhost:8082/\n");
  } catch (e) {
    console.error("✗ Rebuild failed:", e?.message ?? e);
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
  // Если сервер падает — выходим (пользователь увидит и перезапустит).
  server.on("exit", (code) => {
    console.log(`\n[serve] exit ${code}, останавливаю watch.`);
    process.exit(code ?? 0);
  });
  return server;
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
