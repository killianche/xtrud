import { describe, expect, it } from "vitest";
import { filtersSummary } from "./filters-summary";

const categories = [
  { id: "plumbing", name_ru: "Сантехника", l1_id: "utilities" },
  { id: "electrical", name_ru: "Электрика", l1_id: "utilities" },
  { id: "doors", name_ru: "Двери", l1_id: "repair" },
  { id: "windows", name_ru: "Окна", l1_id: "repair" },
  { id: "walls", name_ru: "Стены", l1_id: "repair" },
];
const sections = [
  { id: "utilities", name_ru: "Сантехника и электрика" },
  { id: "repair", name_ru: "Ремонт и отделка" },
];
const base = { categories, sections, cityId: "", district: "" };

describe("filtersSummary", () => {
  it("ничего не выбрано — null", () => {
    expect(filtersSummary({ ...base, l2Ids: [] })).toBeNull();
  });

  it("раздел целиком — название раздела", () => {
    expect(filtersSummary({ ...base, l2Ids: ["plumbing", "electrical"] })).toBe(
      "Сантехника и электрика",
    );
  });

  it("одна и две категории — через запятую, больше — «и ещё N»", () => {
    expect(filtersSummary({ ...base, l2Ids: ["doors"] })).toBe("Двери");
    expect(filtersSummary({ ...base, l2Ids: ["doors", "plumbing"] })).toBe("Двери, Сантехника");
    expect(filtersSummary({ ...base, l2Ids: ["doors", "windows", "walls", "plumbing"] })).toBe(
      "Двери, Окна и ещё 2",
    );
  });

  it("место добавляется через точку; город — по названию, район — как есть", () => {
    expect(filtersSummary({ ...base, l2Ids: ["doors"], district: "Сунженский район" })).toBe(
      "Двери · Сунженский район",
    );
    expect(filtersSummary({ ...base, l2Ids: [], cityId: "nazran", cityName: "Назрань" })).toBe(
      "Назрань",
    );
    expect(filtersSummary({ ...base, l2Ids: [], cityId: "nazran" })).toBeNull();
  });
});
