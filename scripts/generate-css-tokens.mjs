#!/usr/bin/env node
/*
 * generate-css-tokens.mjs — генератор CSS-блока цветовых токенов из src/lib/colors.ts.
 *
 * Источник истины — src/lib/colors.ts (lightColors + darkColors).
 * Цель — global.css (CSS-переменные --token: R G B).
 *
 * Скрипт читает colors.ts, парсит обе палитры, генерирует :root и .dark CSS-блоки,
 * вставляет их между маркерами:
 *
 *   /* @generated:tokens-start *\/
 *   ...сгенерированные :root + .dark...
 *   /* @generated:tokens-end *\/
 *
 * Запуск:
 *   node scripts/generate-css-tokens.mjs           — проверить и обновить global.css
 *   node scripts/generate-css-tokens.mjs --check   — выйти с кодом 1 если требуется пересборка
 *
 * Подключение к pre-commit (lefthook / husky) — позже отдельной задачей.
 * Подключение к npm script "tokens" — добавляем в package.json в этой же правке.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COLORS_TS = resolve(ROOT, "src/lib/colors.ts");
const GLOBAL_CSS = resolve(ROOT, "global.css");

const START_MARKER = "/* @generated:tokens-start */";
const END_MARKER = "/* @generated:tokens-end */";

/** Hex (#rrggbb) → "R G B" триплет для Tailwind alpha-modifier `rgb(var(--x) / 50)`. */
function hexToTriplet(hex) {
  const cleaned = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/**
 * Извлекает объект-палитру { token: hex } из исходного текста colors.ts.
 * Парсер минимальный: ищет `export const NAME = {` ... `} as const;`,
 * внутри — строки вида `"token": "#rrggbb",` или `token: "#rrggbb",`.
 */
function extractPalette(source, name) {
  const start = source.indexOf(`export const ${name} = {`);
  if (start === -1) throw new Error(`Palette ${name} not found in colors.ts`);
  const end = source.indexOf("} as const;", start);
  if (end === -1) throw new Error(`Palette ${name} end marker not found`);
  const body = source.slice(start, end);
  // Захватываем "key" или key (без кавычек) → hex
  const re = /(?:"([\w-]+)"|([\w-]+))\s*:\s*"(#[0-9a-fA-F]{6})"/g;
  const result = {};
  let m;
  while ((m = re.exec(body)) !== null) {
    const key = m[1] ?? m[2];
    const hex = m[3];
    result[key] = hex;
  }
  return result;
}

/** Формирует CSS-строки `--key: R G B;` для палитры. */
function renderVars(palette, indent = "    ") {
  return Object.entries(palette)
    .map(([key, hex]) => `${indent}--${key}: ${hexToTriplet(hex)};`)
    .join("\n");
}

function generateBlock(light, dark) {
  return `${START_MARKER}
@layer base {
  :root {
${renderVars(light)}
  }

  .dark:root,
  :root.dark,
  .dark {
${renderVars(dark)}
  }
}
${END_MARKER}`;
}

function replaceBlock(css, block) {
  const startIdx = css.indexOf(START_MARKER);
  const endIdx = css.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Markers not found in global.css. Вставь в global.css:\n${START_MARKER}\n...\n${END_MARKER}`,
    );
  }
  const before = css.slice(0, startIdx);
  const after = css.slice(endIdx + END_MARKER.length);
  return `${before}${block}${after}`;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const colorsSrc = readFileSync(COLORS_TS, "utf-8");
  const light = extractPalette(colorsSrc, "lightColors");
  const dark = extractPalette(colorsSrc, "darkColors");

  // Sanity: одинаковые ключи в обеих палитрах (по DESIGN.md контракт).
  const lightKeys = Object.keys(light).sort();
  const darkKeys = Object.keys(dark).sort();
  const onlyInLight = lightKeys.filter((k) => !darkKeys.includes(k));
  const onlyInDark = darkKeys.filter((k) => !lightKeys.includes(k));
  if (onlyInLight.length || onlyInDark.length) {
    console.warn(
      `WARN: палитры расходятся.\n  only in light: ${onlyInLight.join(", ") || "(none)"}\n  only in dark:  ${onlyInDark.join(", ") || "(none)"}`,
    );
  }

  const block = generateBlock(light, dark);
  const css = readFileSync(GLOBAL_CSS, "utf-8");
  const updated = replaceBlock(css, block);

  if (updated === css) {
    console.log("✓ global.css уже синхронизирован с colors.ts");
    return;
  }

  if (checkOnly) {
    console.error(
      "✗ global.css не синхронизирован с colors.ts.\nЗапусти: npm run tokens",
    );
    process.exit(1);
  }

  writeFileSync(GLOBAL_CSS, updated, "utf-8");
  console.log(
    `✓ global.css обновлён (${lightKeys.length} токенов light + ${darkKeys.length} dark)`,
  );
}

main();
