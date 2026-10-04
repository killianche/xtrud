import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  CallChecks,
  CHECK_TTL_MS,
  IP_HOURLY_MAX,
  ipBucket,
  PHONE_DAILY_MAX,
  POLL_INTERVAL_MS,
  RESERVE_MS,
  TOKEN_TTL_MS,
} from "../src/auth/call-checks.js";
import { registerAuthRoutes } from "../src/auth/routes.js";
import {
  type AddResult,
  type CallCheckProvider,
  parseAdd,
  parseStatus,
  type StatusResult,
} from "../src/auth/smsru-callcheck.js";
import type { Config } from "../src/config.js";
import type { Db } from "../src/db.js";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const CHECK = { checkId: "1-2", callPhone: "78005008275", callPhonePretty: "+7 (800) 500-8275" };

describe("CallChecks", () => {
  it("секрет, срок проверки и одноразовое подтверждение для этого номера", () => {
    const c = clock();
    const calls = new CallChecks(100, 100, c.now);
    const entry = calls.remember("+79280000001", CHECK);
    expect(calls.owns(entry, entry.secret)).toBe(true);
    expect(calls.owns(entry, "x".repeat(entry.secret.length))).toBe(false);
    expect(calls.owns(entry, undefined)).toBe(false);
    const token = calls.confirm("+79280000001");
    expect(calls.active("+79280000001")).toBeNull();
    expect(calls.consumeToken(token, "+19280000001")).toBe(false);
    calls.remember("+79280000002", CHECK);
    const t2 = calls.confirm("+79280000002");
    expect(calls.consumeToken(t2, "+79280000002")).toBe(true);
    expect(calls.consumeToken(t2, "+79280000002")).toBe(false);
    calls.remember("+79280000003", CHECK);
    c.advance(CHECK_TTL_MS);
    expect(calls.active("+79280000003")).toBeNull();
    calls.remember("+79280000004", CHECK);
    const t4 = calls.confirm("+79280000004");
    c.advance(TOKEN_TTL_MS);
    expect(calls.consumeToken(t4, "+79280000004")).toBe(false);
  });

  it("к провайдеру — не чаще раза в 2 секунды", () => {
    const c = clock();
    const calls = new CallChecks(100, 100, c.now);
    const entry = calls.remember("+79280000001", CHECK);
    expect(calls.shouldPoll(entry)).toBe(true);
    expect(calls.shouldPoll(entry)).toBe(false);
    c.advance(POLL_INTERVAL_MS);
    expect(calls.shouldPoll(entry)).toBe(true);
  });

  it("лимиты: 5 проверок номера в сутки с адреса, 10 в час с адреса, потолок по подтверждённым", () => {
    const calls = new CallChecks(1000, 1000, clock().now);
    for (let i = 0; i < PHONE_DAILY_MAX; i++) calls.countStart("+79280000001", "ip");
    expect(calls.canStart("+79280000001", "ip")).toEqual({ ok: false, reason: "phone_daily" });
    // Чужие попытки не тратят лимит владельца номера (ревью M3).
    expect(calls.canStart("+79280000001", "owner").ok).toBe(true);
    const byIp = new CallChecks(1000, 1000, clock().now);
    for (let i = 0; i < IP_HOURLY_MAX; i++) byIp.countStart(`+792800001${10 + i}`, "ip");
    expect(byIp.canStart("+79289999999", "ip")).toEqual({ ok: false, reason: "ip_hourly" });
    expect(byIp.canStart("+79289999999", "ip2").ok).toBe(true);
    // Деньги — только за подтверждённые: начатые проверки потолок не трогают (M2).
    const c = clock();
    const hourly = new CallChecks(1000, 2, c.now);
    for (let i = 0; i < 5; i++) hourly.countStart(`+7928000000${i}`, `ip${i}`);
    expect(hourly.canStart("+79280000009", "z").ok).toBe(true);
    hourly.confirm("+79280000001");
    hourly.confirm("+79280000002");
    expect(hourly.canStart("+79280000009", "z")).toEqual({ ok: false, reason: "global" });
    c.advance(60 * 60_000);
    expect(hourly.canStart("+79280000009", "z").ok).toBe(true);
  });

  it("место под номер занято до ответа SMS.ru и освобождается через 15 с", () => {
    const c = clock();
    const calls = new CallChecks(100, 100, c.now);
    calls.countStart("+79280000001", "ip");
    const held = calls.active("+79280000001");
    expect(held).not.toBeNull();
    expect(held && calls.owns(held, "")).toBe(false);
    c.advance(RESERVE_MS);
    expect(calls.active("+79280000001")).toBeNull();
  });

  it("подтверждение тратится после записи аккаунта, чужой номер сжигает его", () => {
    const calls = new CallChecks(100, 100, clock().now);
    calls.remember("+79280000001", CHECK);
    const token = calls.confirm("+79280000001");
    expect(calls.tokenValid(token, "+79280000001")).toBe(true);
    expect(calls.tokenValid(token, "+79280000001")).toBe(true);
    expect(calls.consumeToken(token, "+79280000001")).toBe(true);
    expect(calls.tokenValid(token, "+79280000001")).toBe(false);
    calls.remember("+79280000002", CHECK);
    const t2 = calls.confirm("+79280000002");
    expect(calls.tokenValid(t2, "+79280000003")).toBe(false);
    expect(calls.tokenValid(t2, "+79280000002")).toBe(false);
  });

  it("IPv6 — по сети /56", () => {
    expect(ipBucket("2a02:6b8:abcd:1234:1::5")).toBe("2a02:6b8:abcd:1200::/56");
    expect(ipBucket("2a02:6b8:abcd:12ff::1")).toBe("2a02:6b8:abcd:1200::/56");
    expect(ipBucket("2a02:6b8:abcd:7::1")).toBe("2a02:6b8:abcd:0000::/56");
    expect(ipBucket("95.24.1.2")).toBe("95.24.1.2");
  });
});

describe("разбор ответов SMS.ru", () => {
  it("callcheck/add: успех только с check_id и номером", () => {
    expect(
      parseAdd({
        status: "OK",
        status_code: 100,
        check_id: "201737-542",
        call_phone: "78005008275",
        call_phone_pretty: "+7 (800) 500-8275",
      }),
    ).toEqual({
      ok: true,
      checkId: "201737-542",
      callPhone: "78005008275",
      callPhonePretty: "+7 (800) 500-8275",
    });
    expect(
      parseAdd({ status: "OK", status_code: 100, check_id: "1", call_number: 78005008275 }),
    ).toMatchObject({ ok: true, callPhone: "78005008275", callPhonePretty: "+78005008275" });
    expect(parseAdd({ status: "OK", status_code: 100 })).toMatchObject({
      ok: false,
      reason: "provider_error",
    });
    expect(parseAdd({ status: "ERROR", status_code: 202 })).toMatchObject({
      reason: "invalid_number",
    });
    expect(parseAdd({ status: "ERROR", status_code: 201 })).toMatchObject({
      reason: "provider_limit",
    });
    expect(parseAdd(null)).toMatchObject({ reason: "provider_error" });
  });

  it("callcheck/status: подтверждено только явным 401", () => {
    expect(parseStatus({ status: "OK", check_status: "401" })).toBe("confirmed");
    expect(parseStatus({ status: "OK", check_status: 401 })).toBe("confirmed");
    expect(parseStatus({ status: "OK", check_status: "400" })).toBe("waiting");
    expect(parseStatus({ status: "OK", check_status: "402" })).toBe("expired");
    expect(parseStatus({ status: "ERROR", check_status: "401" })).toBe("provider_error");
    expect(parseStatus({})).toBe("provider_error");
  });
});

class FakeProvider implements CallCheckProvider {
  adds = 0;
  next: StatusResult = "waiting";
  async add(): Promise<AddResult> {
    this.adds += 1;
    return { ok: true, ...CHECK, checkId: `c${this.adds}` };
  }
  async status(): Promise<StatusResult> {
    return this.next;
  }
}

async function buildApp(provider: FakeProvider) {
  const app = Fastify();
  const db = {
    asService: async (fn: (c: unknown) => unknown) => fn({ query: async () => ({ rows: [] }) }),
  } as unknown as Db;
  const cfg = { CALLCHECK_DAILY_CAP: 100, CALLCHECK_HOURLY_CAP: 100 } as Config;
  let t = 1_000_000;
  const calls = new CallChecks(100, 100, () => t);
  registerAuthRoutes(app, db, {} as never, cfg, undefined, undefined, undefined, provider, calls);
  await app.ready();
  return { app, tick: (ms: number) => (t += ms) };
}

describe("маршруты обратного звонка", () => {
  const phone = "+79280000001";

  it("номер → звонок → подтверждение только тому, кто начал", async () => {
    const provider = new FakeProvider();
    const { app, tick } = await buildApp(provider);
    const start = await app.inject({ method: "POST", url: "/auth/call/start", payload: { phone } });
    expect(start.statusCode).toBe(200);
    const { secret, callPhone } = start.json();
    expect(callPhone).toBe("78005008275");

    // Повтор тем же клиентом — тот же номер без новой проверки.
    const again = await app.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone, secret },
    });
    expect(again.json().secret).toBe(secret);
    expect(provider.adds).toBe(1);

    // Чужой клиент не получает ни нового номера, ни статуса.
    const other = await app.inject({ method: "POST", url: "/auth/call/start", payload: { phone } });
    expect(other.statusCode).toBe(429);
    expect(other.json().code).toBe("call_busy");
    provider.next = "confirmed";
    const thief = await app.inject({
      method: "POST",
      url: "/auth/call/status",
      payload: { phone, secret: "x".repeat(secret.length) },
    });
    expect(thief.statusCode).toBe(410);

    provider.next = "waiting";
    const wait = await app.inject({
      method: "POST",
      url: "/auth/call/status",
      payload: { phone, secret },
    });
    expect(wait.json()).toEqual({ confirmed: false });
    provider.next = "confirmed";
    tick(POLL_INTERVAL_MS);
    const ok = await app.inject({
      method: "POST",
      url: "/auth/call/status",
      payload: { phone, secret },
    });
    expect(ok.json().confirmed).toBe(true);
    expect(typeof ok.json().verificationToken).toBe("string");
    await app.close();
  });

  it("истёкшая проверка — 410, без ключа SMS.ru — 503", async () => {
    const provider = new FakeProvider();
    const { app } = await buildApp(provider);
    const { secret } = (
      await app.inject({ method: "POST", url: "/auth/call/start", payload: { phone } })
    ).json();
    provider.next = "expired";
    const res = await app.inject({
      method: "POST",
      url: "/auth/call/status",
      payload: { phone, secret },
    });
    expect(res.statusCode).toBe(410);
    await app.close();

    const off = Fastify();
    registerAuthRoutes(
      off,
      {} as Db,
      {} as never,
      { CALLCHECK_DAILY_CAP: 1, CALLCHECK_HOURLY_CAP: 1 } as Config,
    );
    await off.ready();
    const disabled = await off.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone },
    });
    expect(disabled.statusCode).toBe(503);
    const opts = await off.inject({ method: "GET", url: "/auth/options" });
    expect(opts.json()).toEqual({ phoneCallAtRegistration: false });
    await off.close();
  });
});
