import { describe, expect, it } from "vitest";
import { nameProblem } from "./name-check";

describe("nameProblem (№309)", () => {
  it("обычные и ингушские имена проходят", () => {
    for (const v of [
      "Руслан",
      "ГIалгIай",
      "Ӏалиев",
      "Ruslan",
      "Анна-Мария",
      "O'Brien",
      "Крутые семечки",
    ]) {
      expect(nameProblem(v, "Имя"), v).toBeNull();
    }
  });

  it("латинская буква внутри русского слова — ошибка", () => {
    expect(nameProblem("Пoддержка", "Имя")).toMatch(/одного алфавита/);
    expect(nameProblem("Сeмечки", "Название")).toMatch(/одного алфавита/);
  });

  it("слова площадки и невидимые символы — ошибка", () => {
    expect(nameProblem("Admin", "Имя")).toMatch(/админ/);
    expect(nameProblem("Модератор", "Имя")).toMatch(/модератор/);
    expect(nameProblem(`Ру${String.fromCharCode(0x200b)}слан`, "Имя")).toMatch(/невидимые/);
  });

  it("пустое — не ошибка проверки подмены", () => {
    expect(nameProblem("  ", "Фамилия")).toBeNull();
  });
});
