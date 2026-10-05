import { describe, expect, it } from "vitest";
import type { CategoryL1 } from "@/features/categories/use-categories-l1";
import type { VisibleCategory } from "@/features/categories/use-visible-categories";
import { findSectionIdForCategory, groupCategoriesByL1 } from "./category-picker";

const sections: CategoryL1[] = [
  {
    id: "l1-repair",
    name_ru: "Строительство и ремонт",
    icon: "Hammer",
    sort_order: 1,
    is_active: true,
  },
  { id: "l1-home", name_ru: "Дом и быт", icon: "Couch", sort_order: 2, is_active: true },
  { id: "l1-empty", name_ru: "Без подкатегорий", icon: "Cube", sort_order: 3, is_active: true },
];

const categories: VisibleCategory[] = [
  {
    id: "l2-electric",
    l1_id: "l1-repair",
    name_ru: "Электрика",
    icon: "Fan",
    sort_order: 1,
    is_active: true,
    is_visible: true,
    is_featured: false,
  },
  {
    id: "l2-plumbing",
    l1_id: "l1-repair",
    name_ru: "Сантехника",
    icon: "Drop",
    sort_order: 2,
    is_active: true,
    is_visible: true,
    is_featured: false,
  },
  {
    id: "l2-cleaning",
    l1_id: "l1-home",
    name_ru: "Уборка",
    icon: "Broom",
    sort_order: 1,
    is_active: true,
    is_visible: true,
    is_featured: false,
  },
];

describe("groupCategoriesByL1", () => {
  it("группирует подкатегории по разделу и опускает пустые разделы", () => {
    const groups = groupCategoriesByL1(sections, categories);
    expect(groups.map((g) => g.section.id)).toEqual(["l1-repair", "l1-home"]);
    expect(groups[0]?.items.map((c) => c.id)).toEqual(["l2-electric", "l2-plumbing"]);
    expect(groups[1]?.items.map((c) => c.id)).toEqual(["l2-cleaning"]);
  });
});

describe("findSectionIdForCategory", () => {
  it("находит раздел по выбранной категории — для автораскрытия", () => {
    expect(findSectionIdForCategory(categories, "l2-cleaning")).toBe("l1-home");
  });

  it("возвращает null, если категория не найдена (ещё не загрузилась)", () => {
    expect(findSectionIdForCategory(categories, "l2-unknown")).toBeNull();
  });
});
