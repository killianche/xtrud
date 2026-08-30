import { describe, expect, it } from "vitest";
import { taskDetailsPrompt } from "@/features/orders/task-details-prompt";

describe("taskDetailsPrompt", () => {
  it("returns reviewed category-specific guidance", () => {
    expect(taskDetailsPrompt("wallpaper")).toContain("вид обоев");
    expect(taskDetailsPrompt("windows")).toContain("Количество и размеры окон");
    expect(taskDetailsPrompt("doors")).toContain("Количество и размеры дверей");
    expect(taskDetailsPrompt("landscape")).toContain("Площадь территории");
    expect(taskDetailsPrompt("cleaning-post-renovation")).toContain("объём мусора");
  });

  it("does not keep prompts under retired category identifiers", () => {
    expect(taskDetailsPrompt("windows-doors")).toBe("Объём работы, особенности и что уже есть…");
    expect(taskDetailsPrompt("landscaping")).toBe("Объём работы, особенности и что уже есть…");
  });

  it("fails safely to a generic manual prompt", () => {
    expect(taskDetailsPrompt("unknown-category")).toBe("Объём работы, особенности и что уже есть…");
    expect(taskDetailsPrompt(undefined)).toBe("Объём работы, особенности и что уже есть…");
  });
});
