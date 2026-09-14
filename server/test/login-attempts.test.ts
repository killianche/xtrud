import { describe, expect, it } from "vitest";
import {
  FailureWindow,
  LOGIN_MAX_FAILURES,
  LoginAttempts,
  loginAttemptKey,
  PAIR_MAX_FAILURES,
  PAIR_WINDOW_MS,
} from "../src/auth/login-attempts.js";

const PHONE = loginAttemptKey("8 928 730-01-41");

describe("ключ входа", () => {
  it("один номер в разной записи — один ключ", () => {
    expect(PHONE).toBe("phone:9287300141");
    expect(loginAttemptKey("+7 (928) 730 01 41")).toBe("phone:9287300141");
    expect(loginAttemptKey(" Admin@Xtrud.pro ")).toBe("login:admin@xtrud.pro");
  });
});

describe("лимит неудачных входов", () => {
  it("с одного адреса — 10 неудач, и этот адрес закрыт до конца окна", () => {
    let t = 1_000_000;
    const attempts = new LoginAttempts(() => t);
    for (let i = 0; i < PAIR_MAX_FAILURES - 1; i++) attempts.fail(PHONE, "198.51.100.1");
    expect(attempts.blocked(PHONE, "198.51.100.1")).toBe(false);
    attempts.fail(PHONE, "198.51.100.1");
    expect(attempts.blocked(PHONE, "198.51.100.1")).toBe(true);
    t += PAIR_WINDOW_MS + 1;
    expect(attempts.blocked(PHONE, "198.51.100.1")).toBe(false);
  });

  it("чужой перебор с одного адреса не закрывает вход владельцу номера", () => {
    const attempts = new LoginAttempts(() => 0);
    for (let i = 0; i < 30; i++) attempts.fail(PHONE, "203.0.113.66");
    expect(attempts.blocked(PHONE, "203.0.113.66")).toBe(true);
    expect(attempts.blocked(PHONE, "192.0.2.10")).toBe(false);
    expect(attempts.blocked(loginAttemptKey("9280000000"), "203.0.113.66")).toBe(false);
  });

  it("перебор с многих адресов упирается в общий лимит номера", () => {
    const attempts = new LoginAttempts(() => 0);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) attempts.fail(PHONE, `203.0.113.${i % 250}`);
    expect(attempts.blocked(PHONE, "192.0.2.10")).toBe(true);
  });

  it("удачный вход снимает счётчик своего адреса, но не общий", () => {
    const attempts = new LoginAttempts(() => 0);
    for (let i = 0; i < PAIR_MAX_FAILURES; i++) attempts.fail(PHONE, "198.51.100.1");
    attempts.succeed(PHONE, "198.51.100.1");
    expect(attempts.blocked(PHONE, "198.51.100.1")).toBe(false);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) attempts.fail(PHONE, `203.0.113.${i % 250}`);
    attempts.succeed(PHONE, "203.0.113.1");
    expect(attempts.blocked(PHONE, "192.0.2.10")).toBe(true);
  });
});

describe("память счётчика ограничена", () => {
  it("не растёт выше потолка: вытесняется самый старый ключ", () => {
    const w = new FailureWindow(3, 60_000, () => 0, 100);
    for (let i = 0; i < 1_000; i++) w.fail(`k${i}`);
    expect(w.size).toBe(100);
    w.fail("fresh");
    w.fail("fresh");
    w.fail("fresh");
    expect(w.blocked("fresh")).toBe(true);
  });

  it("истёкшие удаляются при переполнении, но не чаще раза в минуту", () => {
    let t = 0;
    const w = new FailureWindow(3, 1_000, () => t, 10);
    for (let i = 0; i < 10; i++) w.fail(`old${i}`);
    t = 5_000;
    w.fail("new0"); // первая уборка: все старые истекли
    expect(w.size).toBe(1);
    for (let i = 1; i < 10; i++) w.fail(`new${i}`);
    t = 7_000; // все new* истекли, но с уборки прошло меньше минуты
    w.fail("next");
    expect(w.size).toBe(10); // уборки не было — вытеснен только самый старый
  });
});
