import { describe, expect, it } from "vitest";
import { onlyCategoryId } from "./only-category";

const categories = [
  { id: "pc-repair", l1_id: "computer-help" },
  { id: "plumbing", l1_id: "utilities" },
  { id: "electrical", l1_id: "utilities" },
];

describe("onlyCategoryId", () => {
  it("возвращает подкатегорию раздела, если она одна", () => {
    expect(onlyCategoryId(categories, "computer-help")).toBe("pc-repair");
  });

  it("null, если подкатегорий несколько или нет", () => {
    expect(onlyCategoryId(categories, "utilities")).toBeNull();
    expect(onlyCategoryId(categories, "unknown")).toBeNull();
  });
});
