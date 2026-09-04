import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const taskIntentSource = readFileSync(
  resolve(process.cwd(), "src/features/orders/TaskIntentStep.tsx"),
  "utf8",
);
const categoryPickerSource = readFileSync(
  resolve(process.cwd(), "app/(details)/orders/category-select.tsx"),
  "utf8",
);
// 2026-09-04: клавишу «Поиск» задаёт общий SearchField, а не каждый экран
// отдельно (правила Apple HIG, см. src/components/ui/SearchField.tsx).
// Контракт от этого не исчез — он просто переехал, поэтому проверяем его там.
const searchFieldSource = readFileSync(
  resolve(process.cwd(), "src/components/ui/SearchField.tsx"),
  "utf8",
);

describe("task intent navigation contract", () => {
  it("gives the iOS search key an explicit non-selecting action", () => {
    expect(taskIntentSource).toContain("onSubmitEditing={showSearchResults}");
    expect(taskIntentSource).toMatch(
      /const showSearchResults = \(\) => \{[\s\S]*?inputRef\.current\?\.blur\(\);[\s\S]*?\};/,
    );
  });

  // 2026-08-30: было наоборот — тест требовал наличие maxFontSizeMultiplier={1.3}
  // на обоих полях. Это и был артефакт капа Dynamic Type (docs/IOS_FOUNDATION.md
  // §9.2 п.3): AppText больше не задаёт его глобально (src/components/AppText.tsx),
  // а эти два TextInput не задают его точечно — обёртки под них уже растущие
  // (min-h вместо h), так что кап им не нужен. Контракт теперь охраняет
  // обратное: чтобы кап сюда не вернули не глядя.
  it("keeps both raw search inputs free of an artificial Dynamic Type cap", () => {
    expect(taskIntentSource).not.toContain("maxFontSizeMultiplier");
    expect(categoryPickerSource).not.toContain("maxFontSizeMultiplier");
  });

  it("makes the category search key reveal live results without changing the task draft", () => {
    expect(searchFieldSource).toContain('returnKeyType="search"');
    expect(categoryPickerSource).toContain("onSubmitEditing={showSearchResults}");
    expect(categoryPickerSource).toMatch(
      /const showSearchResults = \(\) => \{[\s\S]*?inputRef\.current\?\.blur\(\);[\s\S]*?\};/,
    );
    expect(categoryPickerSource).toContain("onChangeText={setQuery}");
  });

  it("passes the saved task wording into the manual category picker", () => {
    expect(taskIntentSource).toContain('params: { mode: "intent", query: resolvedTitle }');
    expect(categoryPickerSource).toContain(
      "useLocalSearchParams<{ mode?: string; query?: string }>()",
    );
    expect(categoryPickerSource).toContain("params.query ?? draftTitle ??");
  });

  it("uses the project loading, error and empty state recipes", () => {
    expect(categoryPickerSource).toContain('placeholder="Например, окна, обои или уборка"');
    expect(categoryPickerSource).toContain("CATEGORY_SKELETON_KEYS.map");
    expect(categoryPickerSource).toContain("<Skeleton");
    expect(categoryPickerSource).toContain("Не удалось загрузить категории");
    expect(categoryPickerSource).toContain("Ничего не нашли");
    expect(categoryPickerSource).toContain("Категории пока недоступны");
  });
});
