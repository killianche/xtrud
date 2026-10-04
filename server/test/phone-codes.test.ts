import { describe, expect, it } from "vitest";
import {
  CODE_TTL_MS,
  IP_HOURLY_MAX,
  ipBucket,
  MAX_VERIFY_ATTEMPTS,
  PHONE_DAILY_MAX,
  PhoneCodes,
  RESEND_COOLDOWN_MS,
  TOKEN_TTL_MS,
  VERIFY_DAILY_MAX,
} from "../src/auth/phone-codes.js";
import { parseSmsRuResponse } from "../src/sms/smsru.js";

function setup(cap = 100) {
  let t = 1_000_000;
  const clock = {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
  const codes = new PhoneCodes(cap, clock.now, () => "123456");
  return { codes, clock };
}

describe("PhoneCodes", () => {
  it("верный код даёт одноразовый токен для этого номера и цели", () => {
    const { codes } = setup();
    codes.issue("9280000001", "reset", "1.1.1.1");
    const r = codes.verify("9280000001", "reset", "123456");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(codes.consumeToken(r.token, "9280000001", "register")).toBe(false);
    // Токен сгорел и при неудачной попытке — повтор не проходит.
    expect(codes.consumeToken(r.token, "9280000001", "reset")).toBe(false);
  });

  it("токен годится один раз и только для своего номера", () => {
    const { codes } = setup();
    codes.issue("9280000001", "register", "ip");
    const r = codes.verify("9280000001", "register", "123456");
    if (!r.ok) throw new Error("expected ok");
    expect(codes.consumeToken(r.token, "9280000002", "register")).toBe(false);
    codes.issue("9280000003", "register", "ip2");
    const r2 = codes.verify("9280000003", "register", "123456");
    if (!r2.ok) throw new Error("expected ok");
    expect(codes.consumeToken(r2.token, "9280000003", "register")).toBe(true);
    expect(codes.consumeToken(r2.token, "9280000003", "register")).toBe(false);
  });

  it("код для регистрации не подходит для смены пароля", () => {
    const { codes } = setup();
    codes.issue("9280000001", "register", "ip");
    expect(codes.verify("9280000001", "reset", "123456")).toEqual({ ok: false, reason: "expired" });
  });

  it("после 5 неверных попыток код сгорает", () => {
    const { codes } = setup();
    codes.issue("9280000001", "reset", "ip");
    for (let i = 1; i < MAX_VERIFY_ATTEMPTS; i++) {
      expect(codes.verify("9280000001", "reset", "000000")).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(codes.verify("9280000001", "reset", "000000")).toEqual({
      ok: false,
      reason: "too_many",
    });
    expect(codes.verify("9280000001", "reset", "123456").ok).toBe(false);
  });

  it("код истекает через 5 минут, токен — через 15", () => {
    const { codes, clock } = setup();
    codes.issue("9280000001", "reset", "ip");
    clock.advance(CODE_TTL_MS);
    expect(codes.verify("9280000001", "reset", "123456")).toEqual({
      ok: false,
      reason: "expired",
    });
    codes.issue("9280000002", "reset", "ip");
    const r = codes.verify("9280000002", "reset", "123456");
    if (!r.ok) throw new Error("expected ok");
    clock.advance(TOKEN_TTL_MS);
    expect(codes.consumeToken(r.token, "9280000002", "reset")).toBe(false);
  });

  it("на номер — не чаще раза в минуту и не больше 5 в сутки", () => {
    const { codes, clock } = setup();
    codes.issue("9280000001", "register", "ip");
    const c = codes.check("9280000001", "register", "ip");
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe("cooldown");
    for (let i = 1; i < PHONE_DAILY_MAX; i++) {
      clock.advance(RESEND_COOLDOWN_MS);
      codes.issue("9280000001", "register", `ip${i}`);
    }
    clock.advance(RESEND_COOLDOWN_MS);
    expect(codes.check("9280000001", "register", "fresh-ip")).toEqual({
      ok: false,
      reason: "phone_daily",
    });
  });

  it("с одного адреса — не больше 10 в час", () => {
    const { codes } = setup();
    for (let i = 0; i < IP_HOURLY_MAX; i++) codes.issue(`92800000${10 + i}`, "register", "ip");
    expect(codes.check("9289999999", "register", "ip")).toEqual({ ok: false, reason: "ip_hourly" });
    expect(codes.check("9289999999", "register", "other").ok).toBe(true);
  });

  it("общий суточный потолок отправок", () => {
    const { codes } = setup(2);
    codes.issue("9280000001", "register", "a");
    codes.issue("9280000002", "register", "b");
    expect(codes.check("9280000003", "register", "c")).toEqual({
      ok: false,
      reason: "global_daily",
    });
  });

  it("потолок регистраций не закрывает восстановление пароля", () => {
    const { codes } = setup(1);
    codes.issue("+79280000001", "register", "a");
    expect(codes.check("+79280000002", "register", "b")).toEqual({
      ok: false,
      reason: "global_daily",
    });
    expect(codes.check("+79280000002", "reset", "b").ok).toBe(true);
  });

  it("токен для +7 917… не подходит номеру +1 917… с теми же 10 цифрами (H1)", () => {
    const { codes } = setup();
    codes.issue("+79175551234", "reset", "ip");
    const r = codes.verify("+79175551234", "reset", "123456");
    if (!r.ok) throw new Error("expected ok");
    expect(codes.consumeToken(r.token, "+19175551234", "reset")).toBe(false);
    // Код тоже привязан к полному номеру: тот же хвост, другая страна.
    codes.issue("+79175551234", "reset", "ip2");
    expect(codes.verify("+19175551234", "reset", "123456").ok).toBe(false);
  });

  it("попытки ввода за сутки не обнуляются новым кодом", () => {
    const { codes, clock } = setup();
    let tries = 0;
    for (let round = 0; round < 5 && tries < VERIFY_DAILY_MAX; round++) {
      codes.issue("+79280000001", "reset", `ip${round}`);
      for (let i = 0; i < MAX_VERIFY_ATTEMPTS && tries < VERIFY_DAILY_MAX; i++) {
        codes.verify("+79280000001", "reset", "000000");
        tries += 1;
      }
      clock.advance(RESEND_COOLDOWN_MS);
    }
    // Новый код уже не отправляется.
    expect(codes.check("+79280000001", "reset", "ip-last")).toEqual({
      ok: false,
      reason: "phone_daily",
    });
  });

  it("IPv6 считается по сети /64", () => {
    expect(ipBucket("2a02:6b8:abcd:1234:1::5")).toBe("2a02:6b8:abcd:1234::/64");
    expect(ipBucket("2a02:6b8:abcd:1234:ffff:1:2:3")).toBe("2a02:6b8:abcd:1234::/64");
    expect(ipBucket("2a02::1")).toBe("2a02:0:0:0::/64");
    expect(ipBucket("95.24.1.2")).toBe("95.24.1.2");
  });

  it("неотправленный код не работает", () => {
    const { codes } = setup();
    codes.issue("9280000001", "reset", "ip");
    codes.discard("9280000001", "reset");
    expect(codes.verify("9280000001", "reset", "123456").ok).toBe(false);
  });
});

describe("parseSmsRuResponse", () => {
  it("успех — только когда и запрос, и сообщение OK", () => {
    expect(
      parseSmsRuResponse({
        status: "OK",
        status_code: 100,
        sms: { "79620000001": { status: "OK", status_code: 100, sms_id: "abc" } },
      }),
    ).toEqual({ ok: true, smsId: "abc" });
  });
  it("оператор не подключён у отправителя → unreachable", () => {
    expect(
      parseSmsRuResponse({
        status: "OK",
        status_code: 100,
        sms: { "79280000001": { status: "ERROR", status_code: 204 } },
      }),
    ).toEqual({ ok: false, reason: "unreachable" });
  });
  it("неверный номер, лимиты, нет денег, мусор", () => {
    expect(
      parseSmsRuResponse({ status: "OK", sms: { x: { status: "ERROR", status_code: 202 } } }),
    ).toEqual({ ok: false, reason: "invalid_number" });
    expect(parseSmsRuResponse({ status: "ERROR", status_code: 201 })).toEqual({
      ok: false,
      reason: "provider_limit",
    });
    expect(
      parseSmsRuResponse({ status: "OK", sms: { x: { status: "ERROR", status_code: 230 } } }),
    ).toEqual({ ok: false, reason: "provider_limit" });
    expect(parseSmsRuResponse(null)).toEqual({ ok: false, reason: "provider_error" });
  });
});
