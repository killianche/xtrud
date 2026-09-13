import { describe, expect, it } from "vitest";
import { LoginAttempts, loginAttemptKey } from "../src/auth/login-attempts.js";

describe("лимит неудачных входов на номер", () => {
  it("один номер в разной записи — один счётчик", () => {
    expect(loginAttemptKey("8 928 730-01-41")).toBe("phone:9287300141");
    expect(loginAttemptKey("+7 (928) 730 01 41")).toBe("phone:9287300141");
    expect(loginAttemptKey(" Admin@Xtrud.pro ")).toBe("login:admin@xtrud.pro");
  });

  it("после лимита неудач вход закрыт до конца окна, потом открыт", () => {
    let t = 1_000_000;
    const attempts = new LoginAttempts(3, 60_000, () => t);
    const key = loginAttemptKey("9287300141");
    attempts.fail(key);
    attempts.fail(key);
    expect(attempts.retryAfterSeconds(key)).toBe(0);
    attempts.fail(key);
    expect(attempts.retryAfterSeconds(key)).toBe(60);
    // Другой номер не затронут.
    expect(attempts.retryAfterSeconds(loginAttemptKey("9280000000"))).toBe(0);
    t += 60_001;
    expect(attempts.retryAfterSeconds(key)).toBe(0);
  });

  it("удачный вход сбрасывает счётчик", () => {
    const attempts = new LoginAttempts(2, 60_000, () => 0);
    const key = loginAttemptKey("9287300141");
    attempts.fail(key);
    attempts.reset(key);
    attempts.fail(key);
    expect(attempts.retryAfterSeconds(key)).toBe(0);
  });
});
