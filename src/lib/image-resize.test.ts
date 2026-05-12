import { describe, expect, it } from "vitest";
import { calcResizedDimensions } from "./image-resize";

describe("calcResizedDimensions", () => {
  it("returns null when largest side is already ≤ maxDimension", () => {
    expect(calcResizedDimensions({ width: 300, height: 400 }, { maxDimension: 512 })).toBeNull();
  });

  it("returns null when largest side equals maxDimension exactly (no scaling needed)", () => {
    expect(calcResizedDimensions({ width: 512, height: 256 }, { maxDimension: 512 })).toBeNull();
  });

  it("scales down a portrait image to fit maxDimension on the tall side", () => {
    expect(calcResizedDimensions({ width: 900, height: 1600 }, { maxDimension: 512 })).toEqual({
      width: 288,
      height: 512,
    });
  });

  it("scales down a landscape image to fit maxDimension on the wide side", () => {
    expect(calcResizedDimensions({ width: 1600, height: 900 }, { maxDimension: 512 })).toEqual({
      width: 512,
      height: 288,
    });
  });

  it("scales down a square image to maxDimension × maxDimension", () => {
    expect(calcResizedDimensions({ width: 4000, height: 4000 }, { maxDimension: 1600 })).toEqual({
      width: 1600,
      height: 1600,
    });
  });

  it("handles 1px-larger-than-max input — returns rounded scaled dims, never null", () => {
    const result = calcResizedDimensions({ width: 513, height: 200 }, { maxDimension: 512 });
    expect(result).not.toBeNull();
    expect(result?.width).toBe(512);
    // 200 * (512/513) ≈ 199.61 → Math.round = 200
    expect(result?.height).toBe(200);
  });

  it("portfolio preset (1600 max) keeps mid-size photos untouched", () => {
    expect(calcResizedDimensions({ width: 1200, height: 800 }, { maxDimension: 1600 })).toBeNull();
  });

  it("portfolio preset shrinks a 4K photo proportionally", () => {
    expect(calcResizedDimensions({ width: 4032, height: 3024 }, { maxDimension: 1600 })).toEqual({
      width: 1600,
      // 3024 * (1600/4032) = 1200
      height: 1200,
    });
  });
});
