import { describe, expect, it, vi } from "vitest";
import {
  type BundledSearchHit,
  searchTaskCatalogWithFallback,
} from "@/features/categories/bundled-task-catalog";

const backendHit: BundledSearchHit = {
  kind: "l2",
  id: "backend-category",
  name_ru: "Backend category",
  l2_id: "backend-category",
  score: 1,
  source: "synonym",
};

describe("searchTaskCatalogWithFallback", () => {
  it("keeps a successful backend result authoritative", async () => {
    const backendSearch = vi.fn().mockResolvedValue([backendHit]);
    const result = await searchTaskCatalogWithFallback("поклеить обои", 10, backendSearch);

    expect(result).toEqual({
      hits: [backendHit],
      wasFlipped: false,
      flippedQuery: null,
      source: "backend",
    });
  });

  it("does not replace a valid empty backend result with the bundle", async () => {
    const result = await searchTaskCatalogWithFallback("поклеить обои", 10, async () => []);

    expect(result).toEqual({
      hits: [],
      wasFlipped: false,
      flippedQuery: null,
      source: "backend",
    });
  });

  it("uses the bundle only after a backend query error", async () => {
    const result = await searchTaskCatalogWithFallback("поклеить обои", 10, async () => {
      throw new Error("network unavailable");
    });

    expect(result.source).toBe("bundle");
    expect(result.hits[0]).toMatchObject({ l2_id: "wallpaper" });
    expect(result.hits.some((hit) => hit.id === "wallpaper-removal")).toBe(false);
  });

  it("keeps authorization and API contract errors visible", async () => {
    await expect(
      searchTaskCatalogWithFallback("поклеить обои", 10, async () => {
        throw { code: "PGRST301", message: "JWT expired" };
      }),
    ).rejects.toMatchObject({ code: "PGRST301" });
  });

  it("keeps a successful original backend result when the flipped request loses transport", async () => {
    const backendSearch = vi.fn(async (value: string) => {
      if (value === "поклеить обои") throw new Error("network unavailable");
      return [backendHit];
    });

    const result = await searchTaskCatalogWithFallback("gjrktbnm j,jb", 10, backendSearch);

    expect(result).toMatchObject({ hits: [backendHit], source: "backend", wasFlipped: false });
  });

  it("does not let a transport failure hide a sibling authorization failure", async () => {
    const backendSearch = vi.fn(async (value: string) => {
      if (value === "gjrktbnm j,jb") throw new Error("network unavailable");
      throw { code: "PGRST301", message: "JWT expired" };
    });

    await expect(
      searchTaskCatalogWithFallback("gjrktbnm j,jb", 10, backendSearch),
    ).rejects.toMatchObject({ code: "PGRST301" });
  });

  it("applies the existing wrong-layout correction to bundle fallback", async () => {
    const result = await searchTaskCatalogWithFallback("gjrktbnm j,jb", 10, async () => {
      throw new Error("dns unavailable");
    });

    expect(result).toMatchObject({
      source: "bundle",
      wasFlipped: true,
      flippedQuery: "поклеить обои",
    });
    expect(result.hits[0]?.l2_id).toBe("wallpaper");
  });
});
