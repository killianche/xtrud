import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/categories/use-search-categories", () => ({ useSearchCategories: vi.fn() }));

import { mergeCategoryMatches } from "./use-category-matches";

const categories = [
  { id: "electrical", l1_id: "utilities", name_ru: "Электрика" },
  { id: "plumbing", l1_id: "utilities", name_ru: "Сантехника" },
  { id: "cleaning", l1_id: "home-services", name_ru: "Уборка (клининг)" },
  { id: "cleaning-post-renovation", l1_id: "home-services", name_ru: "Уборка после ремонта" },
];
const sections = [
  { id: "utilities", name_ru: "Сантехника и электрика" },
  { id: "home-services", name_ru: "Уборка и помощь по хозяйству" },
];

describe("mergeCategoryMatches", () => {
  it("фраза своими словами находит подкатегорию и услугу из умного поиска", () => {
    const m = mergeCategoryMatches("поменять розетку", categories, sections, [
      { kind: "l2", name_ru: "Электрика", l2_id: "electrical", source: "synonym" },
      { kind: "l3", name_ru: "Замена розетки / выключателя", l2_id: "electrical", source: "fts" },
    ]);
    expect(m).toEqual([{ category: categories[0], service: "Замена розетки / выключателя" }]);
  });

  it("совпадение по названию — первым, без сети", () => {
    const m = mergeCategoryMatches("Уборка", categories, sections, []);
    expect(m.map((x) => x.category.id)).toEqual(["cleaning", "cleaning-post-renovation"]);
  });

  it("услуга по одной близости букв подписью не ставится", () => {
    const m = mergeCategoryMatches("перевезти диван", categories, sections, [
      { kind: "l3", name_ru: "Перевезти стройматериалы", l2_id: "plumbing", source: "trigram" },
    ]);
    expect(m).toEqual([{ category: categories[1], service: undefined }]);
  });

  it("название раздела даёт его подкатегории последними, без повторов", () => {
    const m = mergeCategoryMatches("сантехника и", categories, sections, []);
    expect(m.map((x) => x.category.id)).toEqual(["electrical", "plumbing"]);
  });

  it("подкатегории вне видимого каталога и пустой запрос не показываются", () => {
    expect(
      mergeCategoryMatches("маникюр", categories, sections, [
        { kind: "l2", name_ru: "Маникюр и педикюр", l2_id: "manicure", source: "synonym" },
      ]),
    ).toEqual([]);
    expect(mergeCategoryMatches("  ", categories, sections, [])).toEqual([]);
  });
});
