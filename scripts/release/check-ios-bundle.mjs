#!/usr/bin/env node
/**
 * Production-гейт iOS-бандла.
 *
 * Заменяет прежний web-шаг release:check. Продукт — iOS-приложение, поэтому
 * релизный гейт обязан проверять бандл, который реально уезжает в App Store,
 * а не веб-сборку, которой больше нет.
 *
 * Что гейт доказывает:
 *   production-бандл собирается с очищенным кэшем Metro и production-флагами.
 *
 * Этого достаточно, чтобы поймать сломанный импорт, потерянный ассет,
 * несобираемый TypeScript-выход и битую конфигурацию Expo — то есть класс
 * ошибок, который typecheck и unit-тесты не видят.
 *
 * Кэш чистится намеренно: `EXPO_PUBLIC_*` инлайнятся Metro на этапе сборки и
 * кэшируются. Без `--clear` значение может «залипнуть» из предыдущей сборки с
 * другим флагом. Это воспроизводится: две подряд сборки с разным
 * EXPO_PUBLIC_ENABLE_DEMO без --clear дают побайтно одинаковый бандл.
 *
 * Чего этот гейт НЕ проверяет и почему.
 *
 * Прежний web-гейт искал в собранном JS домен demo-входа `xtrud-demo.local` и
 * падал, если dead-code elimination его не убрал. На iOS так проверить нельзя:
 * замер на реальных бандлах (2026-08-30) показал, что `xtrud-demo.local` и
 * `signInWithDemoPhone` присутствуют в Hermes-бандле ОДИНАКОВО при
 * EXPO_PUBLIC_ENABLE_DEMO=false и =true. Строковых различий между двумя
 * сборками нет вообще, кроме временного пути бандлера. Любой маркерный детектор
 * здесь либо всегда молчит, либо всегда падает — то есть даёт ложную
 * уверенность вместо защиты.
 *
 * Demo-вход в production закрыт двумя другими механизмами:
 *   1. флаг инлайнится Metro — литерал `EXPO_PUBLIC_ENABLE_DEMO` в бандле
 *      отсутствует, значит `isDemoEnabled()` свёрнут в константу;
 *   2. `scripts/release/check-mobile-config.mjs` требует
 *      `EXPO_PUBLIC_ENABLE_DEMO === "false"` в production-профиле eas.json,
 *      а `check-version-consistency.mjs` — того же для store-релиза.
 *
 * Комментарий в `src/lib/auth.ts` о том, что demo «не попадает в публичный
 * bundle», для iOS неточен: код в бандле остаётся, недостижимым его делает
 * инлайненный флаг. Учётные данные (`DEMO_PHONE_PREFIX`, номера demo-телефонов)
 * в бандле при этом отсутствуют.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function fail(message) {
  console.error(`iOS bundle gate FAILED: ${message}`);
  process.exit(1);
}

const outputDirectory = mkdtempSync(join(tmpdir(), "xtrud-ios-bundle-"));

try {
  console.log("-> Production-экспорт iOS с очисткой кэша Metro...");
  execFileSync(
    "npx",
    ["expo", "export", "--platform", "ios", "--clear", "--output-dir", outputDirectory],
    {
      cwd: root,
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        EXPO_PUBLIC_ENABLE_DEMO: "false",
        EXPO_PUBLIC_DEMO_MODE: "false",
      },
    },
  );

  const bundleDirectory = join(outputDirectory, "_expo/static/js/ios");
  if (!existsSync(bundleDirectory)) {
    fail("экспорт не создал каталог iOS-бандла");
  }

  const bundles = readdirSync(bundleDirectory).filter(
    (file) => file.endsWith(".hbc") || file.endsWith(".js"),
  );
  if (bundles.length === 0) {
    fail("экспорт не создал iOS-бандл");
  }

  let totalBytes = 0;
  for (const file of bundles) {
    const size = readFileSync(join(bundleDirectory, file)).length;
    if (size === 0) fail(`пустой бандл: ${file}`);
    totalBytes += size;
  }

  console.log(
    `iOS bundle gate passed: ${bundles.length} бандл(ов), ` +
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB.`,
  );
} finally {
  rmSync(outputDirectory, { force: true, recursive: true });
}
