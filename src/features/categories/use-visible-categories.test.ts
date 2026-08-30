import { describe, expect, it } from "vitest";
import {
  type BundledVisibleCategory,
  loadVisibleTaskCatalogWithFallback,
} from "@/features/categories/bundled-task-catalog";

const category: BundledVisibleCategory = {
  id: "wallpaper",
  l1_id: "construction",
  name_ru: "Обои",
  icon: "Paintbrush",
  sort_order: 1,
  is_active: true,
  is_visible: true,
  is_featured: false,
};

describe("loadVisibleTaskCatalogWithFallback", () => {
  it("keeps a successful backend list authoritative", async () => {
    await expect(loadVisibleTaskCatalogWithFallback(async () => [category])).resolves.toEqual({
      items: [category],
      source: "backend",
    });
  });

  it("keeps a valid empty backend list authoritative", async () => {
    await expect(loadVisibleTaskCatalogWithFallback(async () => [])).resolves.toEqual({
      items: [],
      source: "backend",
    });
  });

  it("uses the generated current-scope bundle only after backend error", async () => {
    const result = await loadVisibleTaskCatalogWithFallback(async () => {
      throw new Error("network unavailable");
    });

    expect(result.source).toBe("bundle");
    expect(result.items.some((item) => item.id === "wallpaper")).toBe(true);
    expect(
      result.items.every(
        (item) =>
          item.is_active &&
          item.is_visible &&
          ["construction", "home-services"].includes(item.l1_id),
      ),
    ).toBe(true);
  });
});
