import { describe, expect, it } from "vitest";
import {
  getBundledVisibleCategories,
  searchBundledTaskCatalog,
} from "@/features/categories/bundled-task-catalog";
import { flipLayout } from "@/lib/keyboard-layout";

describe("bundled task catalog", () => {
  it("contains only active visible categories in current product scope", () => {
    const categories = getBundledVisibleCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(
      categories.every(
        (category) =>
          category.is_active &&
          category.is_visible &&
          ["construction", "home-services"].includes(category.l1_id),
      ),
    ).toBe(true);
  });

  it("routes wallpaper installation intent to wallpaper without removal sibling", () => {
    const hits = searchBundledTaskCatalog("поклеить обои", 10);
    expect(hits[0]).toMatchObject({ kind: "l2", l2_id: "wallpaper" });
    expect(hits.some((hit) => hit.id === "wallpaper-removal")).toBe(false);
  });

  it("supports deterministic prefix matches", () => {
    const first = searchBundledTaskCatalog("поклеить обо", 10);
    const second = searchBundledTaskCatalog("поклеить обо", 10);
    expect(first).toEqual(second);
    expect(first[0]?.l2_id).toBe("wallpaper");
  });

  it("keeps a specific prefix when the user adds task details", () => {
    const hits = searchBundledTaskCatalog("поклеить обои в комнате", 10);
    expect(hits[0]?.l2_id).toBe("wallpaper");
    expect(hits.some((hit) => hit.id === "wallpaper-removal")).toBe(false);
  });

  it("offers explicit low-confidence categories for a multi-intent phrase", () => {
    const hits = searchBundledTaskCatalog("убрать двор", 10);
    expect(hits.map((hit) => hit.l2_id)).toContain("cleaning-post-renovation");
    expect(hits.map((hit) => hit.l2_id)).toContain("landscape");
    expect(hits.every((hit) => hit.score < 1)).toBe(true);
  });

  it("can fall back to the known window category without claiming high confidence", () => {
    const hits = searchBundledTaskCatalog("поклеить пленку на окна", 10);
    expect(hits.map((hit) => hit.l2_id)).toContain("windows");
    expect(hits.every((hit) => hit.score < 1)).toBe(true);
  });

  it("can search the query corrected through the existing keyboard-layout helper", () => {
    const corrected = flipLayout("gjrktbnm j,jb");
    expect(corrected).toBe("поклеить обои");
    expect(searchBundledTaskCatalog(corrected, 10)[0]?.l2_id).toBe("wallpaper");
  });
});
