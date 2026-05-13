import { describe, expect, it } from "vitest";
import { MASK_LABEL, maskContactsInText, textHasContactInfo } from "./mask-contacts";

describe("maskContactsInText", () => {
  it("masks +7 phone in plain text", () => {
    expect(maskContactsInText("Звоните +79991234567 в любое время")).toBe(
      `Звоните ${MASK_LABEL} в любое время`,
    );
  });

  it("masks +7 phone with spaces", () => {
    expect(maskContactsInText("Тел: +7 999 123-45-67")).toBe(`Тел: ${MASK_LABEL}`);
  });

  it("masks 8-prefixed phone", () => {
    expect(maskContactsInText("Можете на 8 999 123 45 67")).toBe(`Можете на ${MASK_LABEL}`);
  });

  it("masks phone with parens", () => {
    expect(maskContactsInText("8(999)123-45-67")).toBe(MASK_LABEL);
  });

  it("does NOT mask random 11-digit number without 7/8 prefix", () => {
    expect(maskContactsInText("ИНН 123456789012 — для отчёта")).toBe(
      "ИНН 123456789012 — для отчёта",
    );
  });

  it("masks wa.me / t.me links", () => {
    expect(maskContactsInText("Пиши в wa.me/79991234567")).toBe(`Пиши в ${MASK_LABEL}`);
    expect(maskContactsInText("Telegram: https://t.me/master")).toBe(`Telegram: ${MASK_LABEL}`);
  });

  it("masks @telegram-handle", () => {
    expect(maskContactsInText("Я @magomed_master в телеге")).toBe(`Я ${MASK_LABEL} в телеге`);
  });

  it("does NOT mask short handles (< 5 chars)", () => {
    expect(maskContactsInText("Email @abc")).toBe("Email @abc");
  });

  it("masks email", () => {
    expect(maskContactsInText("Пишите: master@gmail.com")).toBe(`Пишите: ${MASK_LABEL}`);
  });

  it("preserves text without contacts unchanged", () => {
    expect(maskContactsInText("Привет, готов помочь!")).toBe("Привет, готов помочь!");
  });

  it("is idempotent — повторный прогон ничего не меняет", () => {
    const once = maskContactsInText("Тел +79991234567");
    expect(maskContactsInText(once)).toBe(once);
  });

  it("handles empty string", () => {
    expect(maskContactsInText("")).toBe("");
  });
});

describe("textHasContactInfo", () => {
  it("true for phone", () => {
    expect(textHasContactInfo("+79991234567")).toBe(true);
  });

  it("true for messenger link", () => {
    expect(textHasContactInfo("t.me/master")).toBe(true);
  });

  it("true for tg handle", () => {
    expect(textHasContactInfo("@magomed_master")).toBe(true);
  });

  it("true for email", () => {
    expect(textHasContactInfo("a@b.ru")).toBe(true);
  });

  it("false for normal text", () => {
    expect(textHasContactInfo("Готов выехать сегодня")).toBe(false);
  });

  it("false for ИНН-like number", () => {
    expect(textHasContactInfo("ИНН 123456789012")).toBe(false);
  });

  it("false for empty", () => {
    expect(textHasContactInfo("")).toBe(false);
  });
});
