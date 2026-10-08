import { describe, expect, it } from "vitest";
import { pluralRu, responsesLabel, specialistsLabel } from "./plural-ru";

describe("responsesLabel", () => {
  it("склоняет единицу", () => {
    expect(responsesLabel(1)).toBe("1 предложение");
    expect(responsesLabel(21)).toBe("21 предложение");
    expect(responsesLabel(101)).toBe("101 предложение");
  });

  it("склоняет двойку-четвёрку", () => {
    expect(responsesLabel(2)).toBe("2 предложения");
    expect(responsesLabel(3)).toBe("3 предложения");
    expect(responsesLabel(24)).toBe("24 предложения");
  });

  it("склоняет остальные", () => {
    expect(responsesLabel(0)).toBe("0 предложений");
    expect(responsesLabel(5)).toBe("5 предложений");
    expect(responsesLabel(100)).toBe("100 предложений");
  });

  it("держит исключение 11–14", () => {
    // Именно здесь машинные счётчики обычно и врут: «11 отклик».
    expect(responsesLabel(11)).toBe("11 предложений");
    expect(responsesLabel(12)).toBe("12 предложений");
    expect(responsesLabel(13)).toBe("13 предложений");
    expect(responsesLabel(14)).toBe("14 предложений");
    expect(responsesLabel(111)).toBe("111 предложений");
  });

  it("работает с любыми словами", () => {
    expect(pluralRu(1, "задание", "задания", "заданий")).toBe("задание");
    expect(pluralRu(3, "задание", "задания", "заданий")).toBe("задания");
    expect(pluralRu(12, "задание", "задания", "заданий")).toBe("заданий");
  });
});

describe("specialistsLabel", () => {
  it("склоняет счётчик специалистов", () => {
    expect(specialistsLabel(1)).toBe("1 специалист");
    expect(specialistsLabel(3)).toBe("3 специалиста");
    expect(specialistsLabel(7)).toBe("7 специалистов");
  });

  it("держит исключение 11–14", () => {
    expect(specialistsLabel(11)).toBe("11 специалистов");
    expect(specialistsLabel(14)).toBe("14 специалистов");
    expect(specialistsLabel(21)).toBe("21 специалист");
  });
});
