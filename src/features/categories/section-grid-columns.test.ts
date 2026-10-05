import { describe, expect, it } from "vitest";
import { sectionGridColumns } from "./section-grid-columns";

describe("sectionGridColumns", () => {
  it("три колонки на обычном шрифте, меньше — на крупном", () => {
    expect(sectionGridColumns(1)).toBe(3);
    expect(sectionGridColumns(1.12)).toBe(3);
    expect(sectionGridColumns(1.24)).toBe(2);
    expect(sectionGridColumns(1.35)).toBe(2);
    expect(sectionGridColumns(1.65)).toBe(1);
    expect(sectionGridColumns(3.1)).toBe(1);
  });
});
