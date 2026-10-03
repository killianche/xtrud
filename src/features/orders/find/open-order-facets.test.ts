import { describe, expect, it } from "vitest";
import { countByCategory, countInCategories, matchesPlace } from "./open-order-facets";

const rows = [
  { l2_id: "electrical", extra_l2_ids: ["plumbing"], city_id: "karabulak", district: null },
  { l2_id: "electrical", extra_l2_ids: null, city_id: null, district: "Назрановский район" },
  { l2_id: "plumbing", extra_l2_ids: [], city_id: "nazran-magas", district: null },
  { l2_id: "cleaning", extra_l2_ids: null, city_id: null, district: null },
];

describe("matchesPlace", () => {
  it("пустое место — вся Ингушетия", () => {
    expect(rows.every((r) => matchesPlace(r, { cityId: "", district: "" }))).toBe(true);
  });

  it("город видит задания своего района", () => {
    const place = { cityId: "nazran-magas", district: "" };
    expect(rows.filter((r) => matchesPlace(r, place))).toHaveLength(2);
  });

  it("район видит задания своих городов", () => {
    const place = { cityId: "", district: "Назрановский район" };
    expect(rows.filter((r) => matchesPlace(r, place))).toHaveLength(2);
  });

  it("город вне районов — только свои задания", () => {
    const place = { cityId: "karabulak", district: "" };
    expect(rows.filter((r) => matchesPlace(r, place))).toHaveLength(1);
  });
});

describe("countByCategory", () => {
  it("считает основную и дополнительные категории", () => {
    const counts = countByCategory(rows);
    expect(counts.get("electrical")).toBe(2);
    expect(counts.get("plumbing")).toBe(2);
    expect(counts.get("cleaning")).toBe(1);
  });

  it("учитывает место", () => {
    const counts = countByCategory(rows, { cityId: "karabulak", district: "" });
    expect(counts.get("electrical")).toBe(1);
    expect(counts.get("cleaning")).toBeUndefined();
  });
});

describe("countInCategories", () => {
  it("задание в двух категориях раздела считается один раз", () => {
    expect(countInCategories(rows, new Set(["electrical", "plumbing"]))).toBe(3);
  });
});
