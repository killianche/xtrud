import { describe, expect, it } from "vitest";
import {
  enforceCategorySearchContract,
  resolvedCategorySearchQuery,
} from "@/features/categories/category-search-contract";
import type { SearchHit } from "@/features/categories/use-search-categories";

const staleClimateHit: SearchHit = {
  kind: "l2",
  id: "climate",
  l2_id: "climate",
  name_ru: "Отопление",
  score: 1,
  source: "synonym",
};
const applianceHit: SearchHit = {
  kind: "l3",
  id: "ac-install",
  l2_id: "appliance-repair",
  name_ru: "Установка кондиционера",
  score: 0.59,
  source: "fts",
};

describe("enforceCategorySearchContract", () => {
  it("removes the obsolete climate term for air-conditioner work", () => {
    expect(
      enforceCategorySearchContract("установка кондиционера", [staleClimateHit, applianceHit]),
    ).toEqual([applianceHit]);
    expect(enforceCategorySearchContract("почистить кондиционер", [staleClimateHit])).toEqual([]);
    expect(enforceCategorySearchContract("обслужить сплит-систему", [staleClimateHit])).toEqual([]);
  });

  it("does not alter unrelated heating searches", () => {
    expect(enforceCategorySearchContract("ремонт отопления", [staleClimateHit])).toEqual([
      staleClimateHit,
    ]);
  });

  it("enforces the conditioner decision after a wrong-layout correction", () => {
    const effectiveQuery = resolvedCategorySearchQuery("rjylbwbjyth", true, "кондиционер");

    expect(enforceCategorySearchContract(effectiveQuery, [staleClimateHit, applianceHit])).toEqual([
      applianceHit,
    ]);
  });
});
