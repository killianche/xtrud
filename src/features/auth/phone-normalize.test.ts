import { describe, expect, it } from "vitest";
import { normalizeRuPhoneDigits, registerFormSchema } from "./validation";

describe("normalizeRuPhoneDigits", () => {
  // DECISION владельца 2026-09-03: номер вводится в одном формате, иначе
  // человек регистрируется как 8928…, входит как 7928… и не попадает в свой
  // аккаунт. Все записи ниже — один и тот же номер.
  const same = [
    "9281234567",
    "89281234567",
    "79281234567",
    "+79281234567",
    "+7 928 123-45-67",
    "8 (928) 123-45-67",
    "7-928-123-45-67",
  ];

  it("приводит любую запись номера к одним и тем же 10 цифрам", () => {
    for (const value of same) {
      expect(normalizeRuPhoneDigits(value)).toBe("9281234567");
    }
  });

  it("не путает начинающийся на 8 номер с кодом страны", () => {
    // 10 цифр, первая 8 — это уже номер без кода, срезать ничего нельзя.
    expect(normalizeRuPhoneDigits("8121234567")).toBe("8121234567");
  });

  it("из слишком длинной строки берёт последние десять цифр", () => {
    // Контракт для переполнения: значимые цифры номера стоят в конце.
    // Добавочные номера («доб. 12») этим не спасаются — их в поле и не
    // ввести: маска ограничивает ввод десятью цифрами.
    expect(normalizeRuPhoneDigits("92812345671234")).toBe("2345671234");
    expect(normalizeRuPhoneDigits("+7 928 123-45-67")).toHaveLength(10);
  });

  it("отдаёт неполный ввод как есть — валидация отсечёт его сама", () => {
    expect(normalizeRuPhoneDigits("928")).toBe("928");
    expect(normalizeRuPhoneDigits("")).toBe("");
  });
});

describe("registerFormSchema", () => {
  const valid = {
    firstName: "Руслан",
    lastName: "Чербижев",
    phone: "9281234567",
    password: "secret123",
  };

  it("принимает заполненную форму", () => {
    expect(registerFormSchema.safeParse(valid).success).toBe(true);
  });

  it("требует ровно 10 цифр номера", () => {
    expect(registerFormSchema.safeParse({ ...valid, phone: "928123456" }).success).toBe(false);
    expect(registerFormSchema.safeParse({ ...valid, phone: "89281234567" }).success).toBe(false);
  });

  it("требует имя и фамилию", () => {
    expect(registerFormSchema.safeParse({ ...valid, firstName: "" }).success).toBe(false);
    expect(registerFormSchema.safeParse({ ...valid, lastName: "Ч" }).success).toBe(false);
  });

  it("не принимает цифры вместо имени", () => {
    expect(registerFormSchema.safeParse({ ...valid, firstName: "12345" }).success).toBe(false);
  });

  it("требует пароль не короче шести символов", () => {
    expect(registerFormSchema.safeParse({ ...valid, password: "12345" }).success).toBe(false);
  });
});
