// Контракт полей ввода: текст в однострочном поле стоит по центру.
//
// Почему это тест, а не памятка (FACT, 2026-09-04): владелец прислал скриншот
// экрана «Специалисты» — набранное слово стояло ниже центра поля. Причина
// оказалась общей для всего приложения: полю давали класс типографики
// (`text-body-md` и подобные), а в нём есть lineHeight. На iOS lineHeight у
// TextInput кладётся в paragraphStyle.maximumLineHeight, весь запас высоты
// уходит НАД строкой, и текст съезжает вниз (facebook/react-native#39145,
// #28012, #33986). Однажды исправив 22 поля, легко вернуть 23-е.
//
// Правило: у ОДНОСТРОЧНОГО TextInput шрифт задаётся `text-field-*` (только
// размер, без lineHeight) либо inline-стилем. Многострочному lineHeight нужен —
// он там и работает правильно, поэтому multiline из проверки исключён.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "src"];
const TYPOGRAPHY_CLASS = /className=[^>]*?\btext-(body|title|display|mono|caption)\b/;

function collectTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsx(full, acc);
    } else if (extname(full) === ".tsx") {
      acc.push(full);
    }
  }
  return acc;
}

/** Каждый JSX-блок `<TextInput ... />` файла как один кусок текста.
 *  `useRef<TextInput>(null)` — это тип, а не элемент, поэтому за именем
 *  обязателен пробел или перенос строки. */
function textInputBlocks(source: string): string[] {
  const blocks: string[] = [];
  const opening = /<TextInput[\s\n]/g;
  let match = opening.exec(source);
  while (match) {
    const end = source.indexOf("/>", match.index);
    if (end === -1) break;
    blocks.push(source.slice(match.index, end + 2));
    opening.lastIndex = end + 2;
    match = opening.exec(source);
  }
  return blocks;
}

describe("контракт полей ввода", () => {
  it("однострочному TextInput не задают класс с lineHeight", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of collectTsx(resolve(process.cwd(), root))) {
        for (const block of textInputBlocks(readFileSync(file, "utf8"))) {
          if (block.includes("multiline")) continue;
          if (TYPOGRAPHY_CLASS.test(block)) {
            offenders.push(file.replace(`${process.cwd()}/`, ""));
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("общее поле задаёт lineHeight только на web", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ui/Input.tsx"), "utf8");
    expect(source).toContain('Platform.OS === "web" ? { lineHeight: dims.textSize + 6 } : {}');
    // Второго, безусловного lineHeight в файле быть не должно.
    expect(source.match(/lineHeight:/g) ?? []).toHaveLength(1);
  });

  it("поле поиска следует правилам Apple: очистка, клавиша поиска, тема клавиатуры", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/ui/SearchField.tsx"),
      "utf8",
    );
    expect(source).toContain("clearButtonMode=");
    expect(source).toContain('returnKeyType="search"');
    expect(source).toContain("keyboardAppearance=");
    expect(source).toContain("Keyboard.dismiss()");
    expect(source).not.toMatch(/lineHeight:/);
  });
});
