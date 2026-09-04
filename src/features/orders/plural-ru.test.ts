import { describe, expect, it } from "vitest";
import { pluralRu, responsesLabel } from "./plural-ru";

describe("responsesLabel", () => {
  it("склоняет единицу", () => {
    expect(responsesLabel(1)).toBe("1 отклик");
    expect(responsesLabel(21)).toBe("21 отклик");
    expect(responsesLabel(101)).toBe("101 отклик");
  });

  it("склоняет двойку-четвёрку", () => {
    expect(responsesLabel(2)).toBe("2 отклика");
    expect(responsesLabel(3)).toBe("3 отклика");
    expect(responsesLabel(24)).toBe("24 отклика");
  });

  it("склоняет остальные", () => {
    expect(responsesLabel(0)).toBe("0 откликов");
    expect(responsesLabel(5)).toBe("5 откликов");
    expect(responsesLabel(100)).toBe("100 откликов");
  });

  it("держит исключение 11–14", () => {
    // Именно здесь машинные счётчики обычно и врут: «11 отклик».
    expect(responsesLabel(11)).toBe("11 откликов");
    expect(responsesLabel(12)).toBe("12 откликов");
    expect(responsesLabel(13)).toBe("13 откликов");
    expect(responsesLabel(14)).toBe("14 откликов");
    expect(responsesLabel(111)).toBe("111 откликов");
  });

  it("работает с любыми словами", () => {
    expect(pluralRu(1, "задание", "задания", "заданий")).toBe("задание");
    expect(pluralRu(3, "задание", "задания", "заданий")).toBe("задания");
    expect(pluralRu(12, "задание", "задания", "заданий")).toBe("заданий");
  });
});
