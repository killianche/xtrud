import { describe, expect, it } from "vitest";
import { orderCategoryFilter, orderCategoryIds, toggleTaskCategory } from "./order-categories";

describe("order-categories", () => {
  it("основная первой, без повторов и пустых", () => {
    expect(orderCategoryIds({ l2_id: "a", extra_l2_ids: ["b", "a", "", "c"] })).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(orderCategoryIds({ l2_id: "a" })).toEqual(["a"]);
  });

  it("фильтр ищет и по основной, и по дополнительным", () => {
    expect(orderCategoryFilter(["plumbing", "laborers"])).toBe(
      "l2_id.in.(plumbing,laborers),extra_l2_ids.ov.{plumbing,laborers}",
    );
  });

  it("первая отмеченная — основная, не больше трёх", () => {
    let v = { l2Id: "", extraL2Ids: [] as string[] };
    v = toggleTaskCategory(v, "a") ?? v;
    expect(v).toEqual({ l2Id: "a", extraL2Ids: [] });
    v = toggleTaskCategory(v, "b") ?? v;
    v = toggleTaskCategory(v, "c") ?? v;
    expect(v).toEqual({ l2Id: "a", extraL2Ids: ["b", "c"] });
    expect(toggleTaskCategory(v, "d")).toBeNull();
  });

  it("сняли основную — основной становится следующая", () => {
    expect(toggleTaskCategory({ l2Id: "a", extraL2Ids: ["b", "c"] }, "a")).toEqual({
      l2Id: "b",
      extraL2Ids: ["c"],
    });
    expect(toggleTaskCategory({ l2Id: "a", extraL2Ids: [] }, "a")).toEqual({
      l2Id: "",
      extraL2Ids: [],
    });
  });
});
