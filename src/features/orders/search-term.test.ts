import { describe, expect, it } from "vitest";
import { searchTerm } from "./search-term";

describe("searchTerm", () => {
  it("убирает символы синтаксиса фильтра и лишние пробелы", () => {
    expect(searchTerm("  плитка, (ванная)*  ")).toBe("плитка ванная");
    expect(searchTerm('кран"сантехник')).toBe("кран сантехник");
  });
  it("короче двух символов — поиска нет", () => {
    expect(searchTerm("а")).toBeNull();
    expect(searchTerm("   ")).toBeNull();
    expect(searchTerm(null)).toBeNull();
  });
});
