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

describe("task intent navigation contract", () => {
  it("gives the iOS search key an explicit non-selecting action", () => {
    expect(taskIntentSource).toContain("onSubmitEditing={showSearchResults}");
    expect(taskIntentSource).toMatch(
      /const showSearchResults = \(\) => \{[\s\S]*?inputRef\.current\?\.blur\(\);[\s\S]*?\};/,
    );
  });

  it("keeps both raw search inputs within the reviewed Dynamic Type limit", () => {
    expect(taskIntentSource).toContain("maxFontSizeMultiplier={1.3}");
    expect(categoryPickerSource).toContain("maxFontSizeMultiplier={1.3}");
  });

  it("makes the category search key reveal live results without changing the task draft", () => {
    expect(categoryPickerSource).toContain('returnKeyType="search"');
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
