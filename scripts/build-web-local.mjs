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

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "@expo/env";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
loadProjectEnv(ROOT, {
  mode: process.env.WEB_BUILD_MODE === "production" ? "production" : "development",
  silent: true,
});
const productionContract = JSON.parse(
  readFileSync(resolve(ROOT, "release/production.json"), "utf8"),
);

// Preview и production обязаны собираться разными явными режимами. Раньше этот
// скрипт всегда вшивал demo=true, поэтому тот же demo-bundle попадал на
// публичный xtrud.pro. Без WEB_BUILD_MODE сохраняем удобное локальное поведение
// (preview); production допускается только через явный режим.
const BUILD_MODE = process.env.WEB_BUILD_MODE || "preview";
if (BUILD_MODE !== "preview" && BUILD_MODE !== "production") {
  throw new Error(`WEB_BUILD_MODE должен быть preview или production, получено: ${BUILD_MODE}`);
}
const DEMO_LOGIN_FLAG = BUILD_MODE === "preview" ? "true" : "false";
const DEMO_DATA_FLAG = BUILD_MODE === "preview" ? "true" : "false";
const backendUrl = (() => {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!raw) throw new Error("EXPO_PUBLIC_SUPABASE_URL обязателен для web build.");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL должен быть абсолютным HTTP(S) URL.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL должен быть HTTPS origin без path, query, hash или credentials.",
    );
  }
  const normalized = parsed.origin;
  if (BUILD_MODE === "production" && normalized !== productionContract.backend?.url) {
    throw new Error(
      `Production backend URL mismatch: expected ${productionContract.backend?.url}, received ${normalized}`,
    );
  }
  return normalized;
})();

// Папка вывода. По умолчанию `dist` (prod-сборка + initial build watcher'а).
// Watcher в dev-режиме передаёт WEB_OUTPUT_DIR=dist_next, чтобы собирать в
// staging-папку, пока живой `serve` продолжает отдавать старый `dist` (без
// простоя). Затем dev-web-local.mjs делает атомарный своп dist_next → dist и
// рестартит serve. Это устраняет баг «Index of dist/»: раньше rm -rf dist
// сносил папку, в которую `serve` сделал chdir, и он отдавал листинг каталога.
const OUT = process.env.WEB_OUTPUT_DIR || "dist";
const ALLOWED_OUTPUTS = new Set(["dist", "dist_next"]);
if (!ALLOWED_OUTPUTS.has(OUT)) {
  throw new Error(`WEB_OUTPUT_DIR должен быть dist или dist_next, получено: ${OUT}`);
}
if (BUILD_MODE === "production" && OUT !== "dist") {
  throw new Error("Production web build разрешён только в dist/.");
}
// `.env.local` хранит удобные preview-флаги и загружается Expo автоматически.
// Для production источник истины — BUILD_MODE: ниже child process всегда
// получает оба demo-флага=false, а готовый bundle дополнительно сканируется на
// уникальный marker demo-auth. Поэтому локальный preview config не может ни
// загрязнить, ни случайно заблокировать production export.
if (BUILD_MODE === "production" && process.env.WEB_SKIP_CLEAR === "1") {
  throw new Error(
    "WEB_SKIP_CLEAR=1 запрещён для production: cold Metro cache обязателен для demo=false.",
  );
}
const INDEX = resolve(ROOT, OUT, "index.html");

// Дешёвый deterministic gate до Metro: отсутствующий require/import asset
// должен давать короткую понятную ошибку, а не resolver stack в конце export.
execFileSync(process.execPath, [resolve(ROOT, "scripts/release/check-version-consistency.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
execFileSync(process.execPath, [resolve(ROOT, "scripts/release/check-static-assets.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
execFileSync(process.execPath, [resolve(ROOT, "scripts/release/check-public-legal-pages.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(`→ Cleaning ${OUT}/...`);
rmSync(resolve(ROOT, OUT), { recursive: true, force: true });

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
const MARKER = resolve(ROOT, ".expo", "web-build-demo-flags");
const DEMO_MARKER_VALUE = `${DEMO_LOGIN_FLAG}:${DEMO_DATA_FLAG}`;
let needClear;
if (BUILD_MODE === "production") {
  // Production всегда cold. Иначе прогретый preview-cache может сохранить
  // заинлайненный EXPO_PUBLIC_ENABLE_DEMO=true, даже если child env уже false.
  needClear = true;
} else if (process.env.WEB_SKIP_CLEAR === "1") {
  needClear = false;
} else if (process.env.WEB_CLEAR === "1") {
  needClear = true;
} else {
  const prev = existsSync(MARKER) ? readFileSync(MARKER, "utf-8").trim() : null;
  needClear = prev !== DEMO_MARKER_VALUE;
}
console.log(
  `→ Running expo export → ${OUT} [${BUILD_MODE}, demo-login=${DEMO_LOGIN_FLAG}, demo-data=${DEMO_DATA_FLAG}]${needClear ? " (--clear, cold ~27с)" : " (тёплый кэш ~3-5с)"}...`,
);
// Демо-вход (телефоны +79000… → email/пароль 'xtrud') нужен для локального
// preview: тестовые аккаунты + админ (+7 900 000-00-99). Форсим флаг явно.
const expoArgs = ["expo", "export", "--platform", "web"];
if (needClear) expoArgs.push("--clear");
expoArgs.push("--output-dir", OUT);
execFileSync("npx", expoArgs, {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_PUBLIC_ENABLE_DEMO: DEMO_LOGIN_FLAG,
    EXPO_PUBLIC_DEMO_MODE: DEMO_DATA_FLAG,
  },
});
execFileSync(
  process.execPath,
  [resolve(ROOT, "scripts/release/check-public-legal-pages.mjs"), OUT],
  { cwd: ROOT, stdio: "inherit" },
);

// Ложного `demo=false` в release.json недостаточно: проверяем сам результат
// Metro. При корректном production inline + dead-code elimination уникальный
// домен demo-auth отсутствует в JS. Если он остался, тестовый password-flow мог
// попасть в публичный bundle, поэтому release должен остановиться.
if (BUILD_MODE === "production") {
  const bundleDirectory = resolve(ROOT, OUT, "_expo/static/js/web");
  const bundleFiles = existsSync(bundleDirectory)
    ? readdirSync(bundleDirectory)
        .filter((file) => file.endsWith(".js"))
        .map((file) => resolve(bundleDirectory, file))
    : [];
  if (bundleFiles.length === 0) {
    throw new Error("Production export не создал web JS bundle.");
  }
  const leakedDemoBundles = bundleFiles.filter((file) =>
    readFileSync(file, "utf8").includes("xtrud-demo.local"),
  );
  if (leakedDemoBundles.length > 0) {
    throw new Error(`Demo-auth попал в production bundle: ${leakedDemoBundles.join(", ")}`);
  }
  console.log("✓ production bundle не содержит demo-auth flow");
}

// Запоминаем, с каким demo-флагом собрали — чтобы следующий старт превью НЕ
// чистил кэш зря (см. needClear выше). Маркер в .expo/ (gitignored, per-machine).
try {
  mkdirSync(resolve(ROOT, ".expo"), { recursive: true });
  writeFileSync(MARKER, DEMO_MARKER_VALUE, "utf-8");
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

// 2.5) Стрипаем дефолтную Expo-ссылку на фавикон БЕЗ версии — иначе она первая
//      в <head>, браузер берёт её и тянет старый чёрный логотип из кэша.
//      Свои версионированные ссылки (?v=) инжектим ниже в safeAreaMetas.
html = html.replace(/<link rel="icon" href="\/favicon\.ico"\s*\/?>/g, "");

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
const themeGuardScript = `<script id="xtrud-theme-guard">(function(){try{var raw=localStorage.getItem('xtrud-theme');var pref='system';if(raw){var parsed=JSON.parse(raw);pref=(parsed&&parsed.state&&parsed.state.preference)||'system';}var sysDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(pref==='dark'||(pref==='system'&&sysDark))document.documentElement.classList.add('dark');}catch(_){}})();</script>`;
// Версия фавикона — бамп при смене иконки, чтобы пробить агрессивный кэш
// favicon в браузерах (обычный Ctrl+Shift+R его НЕ сбрасывает). Меняем число —
// браузер скачивает новый файл. v4 = брендовая иконка ddd (розовый градиент +
// белый лого, rounded corners), 2026-06-04.
const FAVICON_VERSION = "4";
const safeAreaMetas = [
  // Брендовый фавикон (ddd: розовый градиент + лого, rounded). 3 формата:
  //   - SVG (масштабируемый, retina) — приоритет для современных браузеров;
  //   - ICO (16/32/48/64) — фолбэк для старых браузеров и тех, кто грузит .ico
  //     раньше SVG (именно из-за него на проде висел старый чёрный лого);
  //   - apple-touch-icon (180) — для «на экран Домой» в iOS Safari.
  // Все файлы лежат в public/, копируются в dist. ?v= пробивает кэш браузера.
  `<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=${FAVICON_VERSION}" />`,
  `<link rel="icon" type="image/x-icon" href="/favicon.ico?v=${FAVICON_VERSION}" />`,
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${FAVICON_VERSION}" />`,
  '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />',
  '<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<style id="xtrud-safe-area">html,body{background-color:#ffffff}@media (prefers-color-scheme:dark){html,body{background-color:#0a0a0a}}</style>',
  themeGuardScript,
].join("\n    ");
html = html.replace("</head>", `    ${safeAreaMetas}\n  </head>`);

if (html !== before) {
  writeFileSync(INDEX, html, "utf-8");
  console.log("✓ index.html пропатчен (script + safe-area metas)");
}

// Не полагаемся на сам факт изменения HTML: отдельный patch может перестать
// матчиться после обновления Expo, пока остальные вставки всё ещё проходят.
// Проверяем обязательные свойства итогового release HTML независимо друг от
// друга и останавливаем build до создания release.json.
const htmlPostconditions = [
  {
    ok: /<script\b(?=[^>]*\bsrc="[^"]+")(?=[^>]*\btype="module")[^>]*><\/script>/.test(html),
    message: "не найден module-script с Expo bundle",
  },
  {
    ok: !/<script\b(?=[^>]*\bsrc="[^"]+")(?=[^>]*\bdefer\b)[^>]*><\/script>/.test(html),
    message: "остался classic/defer Expo script",
  },
  {
    ok: /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"\s*\/?>/.test(
      html,
    ),
    message: "нет canonical viewport-fit=cover",
  },
  {
    ok: (html.match(/id="xtrud-theme-guard"/g) ?? []).length === 1,
    message: "theme guard отсутствует или продублирован",
  },
  {
    ok: (html.match(/id="xtrud-safe-area"/g) ?? []).length === 1,
    message: "safe-area style отсутствует или продублирован",
  },
];
const failedPostconditions = htmlPostconditions.filter((item) => !item.ok);
if (failedPostconditions.length > 0) {
  throw new Error(
    `Некорректный ${OUT}/index.html:\n${failedPostconditions
      .map((item) => `  - ${item.message}`)
      .join("\n")}`,
  );
}
console.log("✓ index.html release postconditions пройдены");

// release.json отвечает на главный эксплуатационный вопрос: из какого Git SHA,
// с каким dirty-state и demo-флагом собран конкретный каталог dist/VPS. Он не
// содержит секретов и публикуется рядом со статикой для быстрой диагностики.
function gitOutput(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const gitSha = gitOutput(["rev-parse", "HEAD"]);
const gitStatus = gitOutput(["status", "--porcelain"]);
const releaseManifest = {
  schemaVersion: 4,
  app: "xtrud",
  gitSha,
  gitDirty: gitStatus === "unknown" ? null : gitStatus.length > 0,
  buildMode: BUILD_MODE,
  demoEnabled: DEMO_LOGIN_FLAG === "true",
  demoDataVisible: DEMO_DATA_FLAG === "true",
  backendUrl,
  builtAt: new Date().toISOString(),
};
writeFileSync(
  resolve(ROOT, OUT, "release.json"),
  `${JSON.stringify(releaseManifest, null, 2)}\n`,
  "utf-8",
);
console.log(
  `✓ release.json: ${gitSha.slice(0, 12)}, demo-login=${DEMO_LOGIN_FLAG}, demo-data=${DEMO_DATA_FLAG}`,
);

console.log("\n✓ Готово. Сервить локально:");
console.log("    npm run web:serve");
console.log("  Откроется на http://localhost:8082/");
