import { describe, expect, it } from "vitest";
import { canonicalPhone, isPhoneLogin, phoneKey, phoneToAuthEmail } from "../src/auth/phone.js";

describe("canonicalPhone", () => {
  it("приводит российские номера к +7", () => {
    expect(canonicalPhone("8 928 730-01-41")).toBe("+79287300141");
    expect(canonicalPhone("+7 (928) 730 01 41")).toBe("+79287300141");
    expect(canonicalPhone("9287300141")).toBe("+79287300141");
  });
  it("не ломает иностранные номера", () => {
    expect(canonicalPhone("+375 29 123 45 67")).toBe("+375291234567");
  });
  it("ключ поиска — последние 10 цифр", () => {
    expect(phoneKey("+79287300141")).toBe("9287300141");
    expect(phoneKey("123")).toBeNull();
  });
  it("синтетическая почта как в приложении", () => {
    expect(phoneToAuthEmail("+79287300141", "phone.xtrud.pro")).toBe("79287300141@phone.xtrud.pro");
  });
});

describe("isPhoneLogin", () => {
  it("номер из 10+ цифр — это вход по телефону", () => {
    expect(isPhoneLogin("89292980006")).toBe(true);
    expect(isPhoneLogin("+7 929 298-00-06")).toBe(true);
  });
  it("почта и неполный номер — нет", () => {
    expect(isPhoneLogin("9292980006@phone.xtrud.pro")).toBe(false);
    expect(isPhoneLogin("user@mail.ru")).toBe(false);
    expect(isPhoneLogin("929 298")).toBe(false);
  });
});
