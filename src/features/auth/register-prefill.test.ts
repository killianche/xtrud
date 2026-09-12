import { afterEach, describe, expect, it } from "vitest";
import { clearRegisterPrefill, peekRegisterPrefill, setRegisterPrefill } from "./register-prefill";

afterEach(() => clearRegisterPrefill());

describe("register-prefill", () => {
  it("номер с 8 в начале превращается в 10 цифр, пароль как есть", () => {
    expect(setRegisterPrefill("89292980006", "secret1")).toBe(true);
    expect(peekRegisterPrefill()).toEqual({ phone: "9292980006", password: "secret1" });
  });

  it("почту и неполный номер не запоминаем", () => {
    expect(setRegisterPrefill("user@mail.ru", "x")).toBe(false);
    expect(peekRegisterPrefill()).toBeNull();
    expect(setRegisterPrefill("929 298", "x")).toBe(false);
    expect(peekRegisterPrefill()).toBeNull();
  });

  it("после очистки форма пустая", () => {
    setRegisterPrefill("+7 929 298-00-06", "secret1");
    clearRegisterPrefill();
    expect(peekRegisterPrefill()).toBeNull();
  });
});
