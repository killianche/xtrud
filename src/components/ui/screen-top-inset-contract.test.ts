// Контракт: каждый экран отступает от чёлки.
//
// DECISION владельца 2026-09-06 (FACT со скриншотов): шторки выбора
// «Сортировка», «Город», «Окна и остекление» рисовали заголовок прямо под
// часами и Wi-Fi. «Нужно, чтобы отступ сверху был обязательно, на всём
// приложении, чтобы такого больше никогда не было при создании новых окон».
//
// Правило проверяется тестом, а не памяткой: любой файл маршрута в app/
// обязан либо сам учитывать `insets.top`, либо использовать компонент,
// который делает это за него (LargeTitle, PickerSheetPage), либо быть
// переходом (Redirect) — то есть ничего не рисовать.
//
// Исключение одно — главная: её фото-герой намеренно уходит под статус-бар и
// сам держит отступ внутри (CinematicHero).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = resolve(process.cwd(), "app");
const EXEMPT = new Set(["(tabs)/index.tsx"]);
// Общие экраны-обёртки, которые держат отступ внутри себя (проверено по
// исходникам: каждая читает useSafeAreaInsets и ставит paddingTop).
const INSET_AWARE_WRAPPERS = [
  "OwnerCaseDetailScreen",
  "LegalScreen",
  "NewOrderScreen",
  "<PublishAuthSheet",
  "<OrderDateSheet",
  "<PickerSheetPage",
];
const SATISFIES = [
  "insets.top",
  "useLargeTitle(",
  "<Redirect",
  "SafeAreaView",
  ...INSET_AWARE_WRAPPERS,
];

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routeFiles(full, acc);
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    if (entry.startsWith("_layout") || entry.startsWith("+")) continue;
    acc.push(full);
  }
  return acc;
}

describe("контракт отступа от чёлки", () => {
  it("каждый экран учитывает верхнюю безопасную область", () => {
    const offenders: string[] = [];
    for (const file of routeFiles(APP_DIR)) {
      const rel = relative(APP_DIR, file);
      if (EXEMPT.has(rel)) continue;
      const source = readFileSync(file, "utf8");
      if (!SATISFIES.some((marker) => source.includes(marker))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
