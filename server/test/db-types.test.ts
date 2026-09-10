import pg from "pg";
import { describe, expect, it } from "vitest";
// Разборщики регистрируются при загрузке модуля базы.
import "../src/db.js";

describe("числа из базы", () => {
  it("numeric приходит числом, а не строкой — как было у PostgREST", () => {
    const parse = pg.types.getTypeParser(1700, "text");
    expect(parse("1.0")).toBe(1);
    expect(parse("4.75")).toBe(4.75);
    // Ради этого всё и сделано: у строки нет toFixed.
    expect((parse("5.0") as unknown as number).toFixed(1)).toBe("5.0");
  });

  it("bigint приходит числом — счётчики админки и count(*)", () => {
    const parse = pg.types.getTypeParser(20, "text");
    expect(parse("42")).toBe(42);
    expect(parse("0")).toBe(0);
  });
});
