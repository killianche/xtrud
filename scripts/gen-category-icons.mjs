#!/usr/bin/env node
/*
 * gen-category-icons.mjs — генерит локальные кастомные SVG-иконки категорий.
 *
 * Зачем: для ряда строительных категорий (гипсокартон, плитка, потолки,
 * натяжные потолки, отопление, утепление, заборы, скважины) в наборах Iconify
 * (twemoji/fluent-color) НЕТ подходящих иконок — стояли метафоры-заглушки
 * (кисть, флаг, плёнка), не соответствующие смыслу. Рисуем свои в flat-color
 * fluent-эстетике (как water-sewer).
 *
 * Что делает:
 *   1. Сохраняет читаемые исходники в assets/icons/category/<id>.svg.
 *   2. Кодирует каждую в data-URI (url-encoded, как существующая water-sewer).
 *   3. Вписывает записи в src/lib/local-category-icons.ts (перед `};`),
 *      НЕ трогая существующие.
 *
 * Запуск: node scripts/gen-category-icons.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = resolve(ROOT, "assets/icons/category");
const MAP_FILE = resolve(ROOT, "src/lib/local-category-icons.ts");

// Мягкая опорная тень — общая для всех.
const shadow = (cx = 24, rx = 13) =>
  `<ellipse cx='${cx}' cy='41.6' rx='${rx}' ry='2.3' fill='#000000' opacity='0.10'/>`;

// ── 8 иконок (viewBox 0 0 48 48) ─────────────────────────────────────────────
const SVGS = {
  // Гипсокартон — лист ГКЛ: бежевая панель, торец с белым гипсовым сердечником,
  // загнутый уголок бумаги.
  drywall: `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(24, 13)}
<rect x='13' y='8' width='17' height='32' rx='2.5' fill='#e9dec6'/>
<rect x='30' y='8' width='5' height='32' fill='#f6f1e6'/>
<rect x='30' y='8' width='5' height='32' fill='#cbbd9c' opacity='0.45'/>
<rect x='13' y='8' width='17' height='32' rx='2.5' fill='url(#dwG)'/>
<rect x='16.5' y='15' width='10' height='2' rx='1' fill='#cdbf9d' opacity='0.8'/>
<rect x='16.5' y='22' width='10' height='2' rx='1' fill='#cdbf9d' opacity='0.8'/>
<rect x='16.5' y='29' width='6.5' height='2' rx='1' fill='#cdbf9d' opacity='0.8'/>
<path d='M30 8 h5 v5 z' fill='#fbf8f0'/>
<path d='M30 8 l5 5 v-5 z' fill='#b7a87f' opacity='0.55'/>
<defs><linearGradient id='dwG' x1='13' y1='8' x2='30' y2='40' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#ffffff' stop-opacity='0.35'/><stop offset='1' stop-color='#ffffff' stop-opacity='0'/></linearGradient></defs>
</svg>`,

  // Плитка и мозаика — сетка 2×2 глянцевых плиток с затиркой между ними.
  tiling: `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(24, 13)}
<rect x='9' y='9' width='30' height='30' rx='4' fill='#eef2f4'/>
<rect x='11.5' y='11.5' width='11' height='11' rx='2' fill='#39b3a6'/>
<rect x='25.5' y='11.5' width='11' height='11' rx='2' fill='#2f9fd6'/>
<rect x='11.5' y='25.5' width='11' height='11' rx='2' fill='#2f9fd6'/>
<rect x='25.5' y='25.5' width='11' height='11' rx='2' fill='#39b3a6'/>
<path d='M12.5 12.5 h9 v2 q-7 0 -9 6 z' fill='#ffffff' opacity='0.30'/>
<path d='M26.5 12.5 h9 v2 q-7 0 -9 6 z' fill='#ffffff' opacity='0.30'/>
<path d='M12.5 26.5 h9 v2 q-7 0 -9 6 z' fill='#ffffff' opacity='0.30'/>
<path d='M26.5 26.5 h9 v2 q-7 0 -9 6 z' fill='#ffffff' opacity='0.30'/>
</svg>`,

  // Потолки — потолочная плита сверху с круглой розеткой и подвесом светильника.
  ceilings: `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(24, 12)}
<path d='M7 9 h34 v6 l-6 4 H13 l-6 -4 z' fill='#dfe3ea'/>
<rect x='7' y='9' width='34' height='6' rx='1' fill='#eef1f6'/>
<rect x='22.5' y='15' width='3' height='7' rx='1.5' fill='#9aa3b2'/>
<circle cx='24' cy='28' r='7' fill='#ffd66b'/>
<circle cx='24' cy='28' r='7' fill='url(#clG)'/>
<circle cx='24' cy='28' r='3.4' fill='#fff4cf'/>
<ellipse cx='21.6' cy='25.6' rx='2.2' ry='1.5' fill='#ffffff' opacity='0.6'/>
<defs><radialGradient id='clG' cx='0.4' cy='0.35' r='0.7'><stop offset='0' stop-color='#ffe79a'/><stop offset='1' stop-color='#f4b740'/></radialGradient></defs>
</svg>`,

  // Натяжные потолки — глянцевая натянутая плёнка с тремя точечными светильниками.
  "tension-ceilings": `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(24, 13)}
<rect x='7' y='13' width='34' height='22' rx='4' fill='#cfd8e6'/>
<rect x='9' y='15' width='30' height='18' rx='3' fill='#eaf1fb'/>
<rect x='9' y='15' width='30' height='18' rx='3' fill='url(#tcG)'/>
<circle cx='16' cy='24' r='2.6' fill='#ffd76a'/><circle cx='16' cy='24' r='1.1' fill='#fff3cf'/>
<circle cx='24' cy='24' r='2.6' fill='#ffd76a'/><circle cx='24' cy='24' r='1.1' fill='#fff3cf'/>
<circle cx='32' cy='24' r='2.6' fill='#ffd76a'/><circle cx='32' cy='24' r='1.1' fill='#fff3cf'/>
<path d='M11 16 L20 16 L13 31 L9 31 z' fill='#ffffff' opacity='0.45'/>
<defs><linearGradient id='tcG' x1='9' y1='15' x2='39' y2='33' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#ffffff' stop-opacity='0.7'/><stop offset='1' stop-color='#cfe0f5' stop-opacity='0.2'/></linearGradient></defs>
</svg>`,

  // Отопление — секционный радиатор с трубами, вентилем и волнами тепла.
  climate: `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(23, 13)}
<rect x='11' y='14' width='24' height='4' rx='2' fill='#c4ccd6'/>
<rect x='11' y='30' width='24' height='4' rx='2' fill='#c4ccd6'/>
<g fill='#e7edf4'>
<rect x='12.5' y='13' width='4.2' height='22' rx='2.1'/>
<rect x='18.4' y='13' width='4.2' height='22' rx='2.1'/>
<rect x='24.3' y='13' width='4.2' height='22' rx='2.1'/>
<rect x='30.2' y='13' width='4.2' height='22' rx='2.1'/>
</g>
<g fill='#ffffff' opacity='0.55'>
<rect x='13.4' y='15' width='1.4' height='18' rx='0.7'/>
<rect x='19.3' y='15' width='1.4' height='18' rx='0.7'/>
<rect x='25.2' y='15' width='1.4' height='18' rx='0.7'/>
</g>
<rect x='9' y='33' width='4' height='6' rx='1.5' fill='#9aa3b2'/>
<circle cx='35' cy='16' r='3.2' fill='#7f8896'/>
<path d='M38 22 q3 2 0 4 q-3 2 0 4' stroke='#ff6b5e' stroke-width='2' fill='none' stroke-linecap='round'/>
<path d='M42 20 q3 2 0 4 q-3 2 0 4' stroke='#ffae42' stroke-width='2' fill='none' stroke-linecap='round'/>
</svg>`,

  // Утепление и изоляция — рулон минеральной ваты, частично раскатанный.
  insulation: `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(24, 13)}
<path d='M10 30 q4 -3 9 -3 q5 0 9 3 v6 q-4 3 -9 3 q-5 0 -9 -3 z' fill='#f4c14e'/>
<path d='M10 30 q4 -3 9 -3 q5 0 9 3 v6 q-4 3 -9 3 q-5 0 -9 -3 z' fill='url(#inG)'/>
<rect x='27' y='15' width='12' height='21' rx='5.5' fill='#f6cf6a'/>
<rect x='27' y='15' width='12' height='21' rx='5.5' fill='url(#inG2)'/>
<ellipse cx='33' cy='15.5' rx='6' ry='2.4' fill='#fff0c0'/>
<g stroke='#e2a73a' stroke-width='1.4' fill='none' opacity='0.8'>
<path d='M29 18 q4 2 8 0'/><path d='M29 22 q4 2 8 0'/><path d='M29 26 q4 2 8 0'/><path d='M29 30 q4 2 8 0'/>
</g>
<defs>
<linearGradient id='inG' x1='10' y1='27' x2='28' y2='39' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#ffe39a'/><stop offset='1' stop-color='#eaad36'/></linearGradient>
<linearGradient id='inG2' x1='27' y1='15' x2='39' y2='36' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#ffe6a0'/><stop offset='1' stop-color='#edb13d'/></linearGradient>
</defs>
</svg>`,

  // Заборы и ворота — деревянный штакетник: пикеты с острыми верхушками + 2 рейки.
  "fences-gates": `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(24, 14)}
<g fill='#caa06a'>
<path d='M8 16 l3.5 -3 3.5 3 v22 h-7 z'/>
<path d='M16.5 16 l3.5 -3 3.5 3 v22 h-7 z'/>
<path d='M25 16 l3.5 -3 3.5 3 v22 h-7 z'/>
<path d='M33.5 16 l3.5 -3 3.5 3 v22 h-7 z'/>
</g>
<rect x='6' y='20' width='36' height='3.4' rx='1.5' fill='#a87f4d'/>
<rect x='6' y='31' width='36' height='3.4' rx='1.5' fill='#a87f4d'/>
<g fill='#ffffff' opacity='0.30'>
<rect x='9' y='15' width='1.4' height='22'/>
<rect x='17.5' y='15' width='1.4' height='22'/>
<rect x='26' y='15' width='1.4' height='22'/>
<rect x='34.5' y='15' width='1.4' height='22'/>
</g>
</svg>`,

  // Бурение скважин и колодцы — слои грунта, скважина и поднимающаяся капля воды.
  "drilling-wells": `<svg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'>
${shadow(24, 13)}
<path d='M6 28 h36 v9 a3 3 0 0 1 -3 3 H9 a3 3 0 0 1 -3 -3 z' fill='#b98a52'/>
<path d='M6 28 h36 v4 H6 z' fill='#caa066'/>
<rect x='20.5' y='28' width='7' height='13' fill='#6f5430'/>
<ellipse cx='24' cy='28' rx='4' ry='1.6' fill='#5a431f'/>
<path d='M24 9 c0 0 6 7 6 11 a6 6 0 0 1 -12 0 c0 -4 6 -11 6 -11 z' fill='#39a7ef'/>
<path d='M24 9 c0 0 6 7 6 11 a6 6 0 0 1 -12 0 c0 -4 6 -11 6 -11 z' fill='url(#dwwG)'/>
<ellipse cx='21.6' cy='19' rx='1.7' ry='2.4' fill='#ffffff' opacity='0.55'/>
<defs><linearGradient id='dwwG' x1='18' y1='10' x2='30' y2='26' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#8fd2ff'/><stop offset='1' stop-color='#1f7fd6'/></linearGradient></defs>
</svg>`,
};

// ── url-encode в data-URI (как существующая water-sewer: одинарные кавычки,
//    %23 для #, %3C/%3E, %20 для пробелов) ───────────────────────────────────
function toDataUri(svg) {
  const s = svg
    .replace(/\n/g, " ")
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/&/g, "%26")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "%20");
  return `data:image/svg+xml,${s}`;
}

// 1. Сохраняем читаемые исходники.
if (!existsSync(ICONS_DIR)) mkdirSync(ICONS_DIR, { recursive: true });
for (const [id, svg] of Object.entries(SVGS)) {
  writeFileSync(resolve(ICONS_DIR, `${id}.svg`), `${svg.trim()}\n`, "utf-8");
}

// 2. Вписываем data-URI в local-category-icons.ts (перед закрывающим `};`),
//    заменяя существующие записи с тем же id (идемпотентно).
let map = readFileSync(MAP_FILE, "utf-8");
for (const [id, svg] of Object.entries(SVGS)) {
  const uri = toDataUri(svg);
  const line = `  ${JSON.stringify(id)}: ${JSON.stringify(uri)},`;
  const reExisting = new RegExp(`^\\s*${JSON.stringify(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");
  if (reExisting.test(map)) {
    map = map.replace(reExisting, line);
  } else {
    map = map.replace(/\n\};\s*$/, `\n${line}\n};\n`);
  }
}
writeFileSync(MAP_FILE, map, "utf-8");

console.log(`✓ ${Object.keys(SVGS).length} иконок: исходники в assets/icons/category/, data-URI в local-category-icons.ts`);
