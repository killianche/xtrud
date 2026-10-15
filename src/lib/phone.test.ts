import { describe, expect, it } from "vitest";
import { canonicalPhone, dialPhone } from "./phone";
import { normalizeWhatsappDigits } from "./whatsapp";

describe("canonicalPhone (№344)", () => {
  it("российский номер в любой записи → +7XXXXXXXXXX", () => {
    for (const v of [
      "6504992804",
      "650 499-28-04",
      "8 650 499-28-04",
      "8(650)4992804",
      "+7 650 499-28-04",
      "76504992804",
    ]) {
      expect(canonicalPhone(v)).toBe("+76504992804");
    }
  });

  it("иностранный номер с «+» не переписывается в +7", () => {
    expect(canonicalPhone("+1 (650) 499-28-04")).toBe("+16504992804");
    expect(canonicalPhone("+49 151 2345 6789")).toBe("+4915123456789");
  });

  it("пусто → пустая строка, для звонка — null", () => {
    expect(canonicalPhone("  ")).toBe("");
    expect(dialPhone(null)).toBeNull();
    expect(dialPhone("")).toBeNull();
  });
});

describe("normalizeWhatsappDigits (№344)", () => {
  it("номер без кода страны получает 7 для wa.me", () => {
    expect(normalizeWhatsappDigits("650 499-28-04")).toBe("76504992804");
    expect(normalizeWhatsappDigits("89281234567")).toBe("79281234567");
    expect(normalizeWhatsappDigits("+79281234567")).toBe("79281234567");
  });
});
