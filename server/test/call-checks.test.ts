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
import { parseTestPhones } from "../src/auth/test-phones.js";
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

/** Подтверждение, которое обязано выдаться (иначе тест падает). */
function confirmOk(c: CallChecks, phone: string): string {
  const t = c.confirm(phone);
  if (!t) throw new Error("подтверждение не выдано");
  return t;
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
    const token = confirmOk(calls, "+79280000001");
    expect(calls.active("+79280000001")).toBeNull();
    expect(calls.consumeToken(token, "+19280000001")).toBe(false);
    calls.remember("+79280000002", CHECK);
    const t2 = confirmOk(calls, "+79280000002");
    expect(calls.consumeToken(t2, "+79280000002")).toBe(true);
    expect(calls.consumeToken(t2, "+79280000002")).toBe(false);
    calls.remember("+79280000003", CHECK);
    c.advance(CHECK_TTL_MS);
    expect(calls.active("+79280000003")).toBeNull();
    calls.remember("+79280000004", CHECK);
    const t4 = confirmOk(calls, "+79280000004");
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
    for (let i = 0; i < PHONE_DAILY_MAX; i++)
      calls.countStart("+79280000001", "ip", "register", null);
    expect(calls.canStart("+79280000001", "ip")).toEqual({ ok: false, reason: "phone_daily" });
    // Чужие попытки не тратят лимит владельца номера (ревью M3).
    expect(calls.canStart("+79280000001", "owner").ok).toBe(true);
    const byIp = new CallChecks(1000, 1000, clock().now);
    for (let i = 0; i < IP_HOURLY_MAX; i++)
      byIp.countStart(`+792800001${10 + i}`, "ip", "register", null);
    expect(byIp.canStart("+79289999999", "ip")).toEqual({ ok: false, reason: "ip_hourly" });
    expect(byIp.canStart("+79289999999", "ip2").ok).toBe(true);
    // Деньги — только за подтверждённые: начатые проверки потолок не трогают (M2).
    const c = clock();
    const hourly = new CallChecks(1000, 2, c.now);
    for (let i = 0; i < 5; i++) hourly.countStart(`+7928000000${i}`, `ip${i}`, "register", null);
    expect(hourly.canStart("+79280000009", "z").ok).toBe(true);
    confirmOk(hourly, "+79280000001");
    confirmOk(hourly, "+79280000002");
    expect(hourly.canStart("+79280000009", "z")).toEqual({ ok: false, reason: "global" });
    c.advance(60 * 60_000);
    expect(hourly.canStart("+79280000009", "z").ok).toBe(true);
  });

  it("место под номер занято до ответа SMS.ru и освобождается через 15 с", () => {
    const c = clock();
    const calls = new CallChecks(100, 100, c.now);
    calls.countStart("+79280000001", "ip", "register", null);
    const held = calls.active("+79280000001");
    expect(held).not.toBeNull();
    expect(held && calls.owns(held, "")).toBe(false);
    c.advance(RESERVE_MS);
    expect(calls.active("+79280000001")).toBeNull();
  });

  it("подтверждение тратится после записи аккаунта, чужой номер сжигает его", () => {
    const calls = new CallChecks(100, 100, clock().now);
    calls.remember("+79280000001", CHECK);
    const token = confirmOk(calls, "+79280000001");
    expect(calls.tokenValid(token, "+79280000001")).toBe(true);
    expect(calls.tokenValid(token, "+79280000001")).toBe(true);
    expect(calls.consumeToken(token, "+79280000001")).toBe(true);
    expect(calls.tokenValid(token, "+79280000001")).toBe(false);
    calls.remember("+79280000002", CHECK);
    const t2 = confirmOk(calls, "+79280000002");
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
    // Живой ответ SMS.ru (2026-10-04): номер с плюсом, «красивый» — через дефисы.
    expect(
      parseAdd({
        status: "OK",
        status_code: 100,
        check_id: "123456789012345",
        call_phone: "+78007779999",
        call_phone_pretty: "8-800-777-9999",
      }),
    ).toEqual({
      ok: true,
      checkId: "123456789012345",
      callPhone: "78007779999",
      callPhonePretty: "8-800-777-9999",
    });
    expect(parseStatus({ status: "OK", status_code: 100, check_status: 400 })).toBe("waiting");
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

describe("цель подтверждения", () => {
  it("подтверждение годится только для своей цели и своего аккаунта", () => {
    const calls = new CallChecks(100, 100, clock().now);
    calls.countStart("+79280000001", "ip", "recover", null);
    calls.remember("+79280000001", CHECK);
    const t = confirmOk(calls, "+79280000001");
    expect(calls.tokenValid(t, "+79280000001", "register")).toBe(false);
    calls.countStart("+79280000002", "ip", "recover", null);
    calls.remember("+79280000002", CHECK);
    const t2 = confirmOk(calls, "+79280000002");
    expect(calls.consumeToken(t2, "+79280000002", "recover")).toBe(true);
    calls.countStart("+79280000003", "ip", "change_phone", "user-a");
    calls.remember("+79280000003", CHECK);
    const t3 = confirmOk(calls, "+79280000003");
    expect(calls.tokenValid(t3, "+79280000003", "change_phone", "user-a")).toBe(true);
    expect(calls.tokenValid(t3, "+79280000003", "change_phone", "user-b")).toBe(false);
    // Восстановление — только тому аккаунту, что был у номера на старте.
    calls.countStart("+79280000004", "ip", "recover", "acc-1");
    calls.remember("+79280000004", CHECK);
    const t4 = confirmOk(calls, "+79280000004");
    expect(calls.tokenValid(t4, "+79280000004", "recover", "acc-2")).toBe(false);
  });

  it("подтверждение — только по той проверке, что опрашивали", () => {
    const calls = new CallChecks(100, 100, clock().now);
    calls.countStart("+79280000001", "ip", "register", null);
    const first = calls.remember("+79280000001", CHECK);
    calls.forget("+79280000001");
    calls.countStart("+79280000001", "ip2", "recover", "acc-1");
    calls.remember("+79280000001", { ...CHECK, checkId: "other" });
    expect(calls.confirm("+79280000001", first)).toBeNull();
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
    expect(opts.json()).toEqual({
      phoneCallAtRegistration: false,
      phoneCallLogin: false,
      passwordLogin: false,
      phoneCallRecovery: false,
      phoneCallPhoneChange: false,
    });
    await off.close();
  });
});

// Поддельная база для маршрутов входа: аккаунты по номеру и id, запись
// вызовов функций.
function fakeAuthDb() {
  const accounts = new Map<string, Record<string, unknown>>();
  const calls: { sql: string; params: unknown[] }[] = [];
  const staff = new Set<string>();
  const row = (id: string, phone: string) => ({
    id,
    email: `${phone.slice(1)}@phone.xtrud.pro`,
    phone,
    encrypted_password: "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Y7p4E7g0vX3s6f1G9o7z4h1j2k3l4",
    banned_until: null,
    deleted_at: null,
    user_status: "active",
  });
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("find_account")) {
        const want = String(params[0]).replace(/\D/g, "").slice(-10);
        const hit = [...accounts.values()].find(
          (a) => String(a.phone).replace(/\D/g, "").slice(-10) === want,
        );
        return { rows: hit ? [hit] : [] };
      }
      if (sql.includes("account_by_id")) {
        const hit = accounts.get(String(params[0]));
        return { rows: hit ? [hit] : [] };
      }
      if (sql.includes("change_account_phone")) {
        const a = accounts.get(String(params[0]));
        if (a) a.phone = params[1];
        return { rows: [] };
      }
      if (sql.includes("account_is_staff")) {
        return { rows: [{ account_is_staff: staff.has(String(params[0])) }] };
      }
      if (sql.includes("register_account")) {
        const id = `u${accounts.size + 1}`;
        accounts.set(id, { ...row(id, String(params[2])), encrypted_password: params[1] });
        return { rows: [{ register_account: id }] };
      }
      if (sql.includes("INSERT INTO xtrud_api.refresh_tokens")) return { rows: [{ id: "s1" }] };
      return { rows: [] };
    },
  };
  const db = { asService: async (fn: (c: unknown) => unknown) => fn(client) } as unknown as Db;
  return { db, accounts, calls, row, staff };
}

async function buildAuthApp(provider: FakeProvider, extra: Partial<Config> = {}) {
  const app = Fastify();
  const fake = fakeAuthDb();
  fake.accounts.set("u1", fake.row("u1", "+79280000001"));
  fake.accounts.set("u2", fake.row("u2", "+79280000002"));
  const tokensStub = {
    verify: async (t: string | undefined) => (t === "access-u1" ? { sub: "u1" } : null),
    signAccess: async () => ({ token: "new-access", expiresAt: 1 }),
  };
  const cfg = {
    CALLCHECK_DAILY_CAP: 100,
    CALLCHECK_HOURLY_CAP: 100,
    REFRESH_TTL_DAYS: 30,
    PHONE_EMAIL_DOMAIN: "phone.xtrud.pro",
    ...extra,
  } as Config;
  let t = 1_000_000;
  const calls = new CallChecks(100, 100, () => t);
  registerAuthRoutes(
    app,
    fake.db,
    tokensStub as never,
    cfg,
    undefined,
    undefined,
    undefined,
    provider,
    calls,
  );
  await app.ready();
  const confirmFor = async (phone: string, purpose: string, auth?: string) => {
    const start = await app.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone, purpose },
      headers: auth ? { authorization: `Bearer ${auth}` } : {},
    });
    const { secret } = start.json();
    provider.next = "confirmed";
    t += POLL_INTERVAL_MS;
    const ok = await app.inject({
      method: "POST",
      url: "/auth/call/status",
      payload: { phone, secret },
    });
    provider.next = "waiting";
    return ok.json().verificationToken as string;
  };
  return { app, fake, confirmFor };
}

describe("восстановление пароля звонком", () => {
  it("нет аккаунта — 404; подтверждение регистрации не годится; верное — новый вход", async () => {
    const provider = new FakeProvider();
    const { app, fake, confirmFor } = await buildAuthApp(provider);
    const none = await app.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone: "+79289999999", purpose: "recover" },
    });
    expect(none.statusCode).toBe(404);
    expect(none.json().code).toBe("account_not_found");

    const registerToken = await confirmFor("+79281111111", "register");
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: {
        phone: "+79281111111",
        verificationToken: registerToken,
        newPassword: "newpass123",
      },
    });
    expect(wrong.statusCode).toBe(428);

    const token = await confirmFor("+79280000001", "recover");
    const ok = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: { phone: "+79280000001", verificationToken: token, newPassword: "newpass123" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().accessToken).toBe("new-access");
    expect(
      fake.calls.some((c) => c.sql.includes("set_password_hash") && c.params[0] === "u1"),
    ).toBe(true);
    expect(
      fake.calls.some((c) => c.sql.includes("revoked_at = now()") && c.params[0] === "u1"),
    ).toBe(true);
    const again = await app.inject({
      method: "POST",
      url: "/auth/recover",
      payload: { phone: "+79280000001", verificationToken: token, newPassword: "other1234" },
    });
    expect(again.statusCode).toBe(428);
    await app.close();
  });
});

describe("смена номера звонком", () => {
  it("только со входом, на свободный номер, подтверждение — своему аккаунту", async () => {
    const provider = new FakeProvider();
    const { app, fake, confirmFor } = await buildAuthApp(provider);
    const start = (phone: string, auth?: string) =>
      app.inject({
        method: "POST",
        url: "/auth/call/start",
        payload: { phone, purpose: "change_phone" },
        headers: auth ? { authorization: `Bearer ${auth}` } : {},
      });
    expect((await start("+79283333333")).statusCode).toBe(401);
    expect((await start("+79280000002", "access-u1")).json().code).toBe("phone_taken");
    expect((await start("+79280000001", "access-u1")).json().code).toBe("phone_same");

    const token = await confirmFor("+79283333333", "change_phone", "access-u1");
    const noAuth = await app.inject({
      method: "POST",
      url: "/auth/phone",
      payload: { phone: "+79283333333", verificationToken: token },
    });
    expect(noAuth.statusCode).toBe(401);
    const ok = await app.inject({
      method: "POST",
      url: "/auth/phone",
      payload: { phone: "+79283333333", verificationToken: token },
      headers: { authorization: "Bearer access-u1" },
    });
    expect(ok.statusCode).toBe(200);
    expect(fake.accounts.get("u1")?.phone).toBe("+79283333333");
    expect(ok.json().user.phone).toBe("+79283333333");
    await app.close();
  });
});

describe("вход по номеру звонком, без пароля (№380)", () => {
  it("звонок с целью «вход» → сессия; подтверждение одноразовое и только своего аккаунта", async () => {
    const provider = new FakeProvider();
    const { app, confirmFor } = await buildAuthApp(provider);
    const none = await app.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone: "+79289999999", purpose: "login" },
    });
    expect(none.statusCode).toBe(404);
    expect(none.json().code).toBe("account_not_found");

    // Подтверждение регистрации и восстановления для входа не годится.
    const recoverToken = await confirmFor("+79280000001", "recover");
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/call/login",
      payload: { phone: "+79280000001", verificationToken: recoverToken },
    });
    expect(wrong.statusCode).toBe(428);

    // Подтверждение чужого номера не открывает другой аккаунт.
    const otherToken = await confirmFor("+79280000002", "login");
    const stolen = await app.inject({
      method: "POST",
      url: "/auth/call/login",
      payload: { phone: "+79280000001", verificationToken: otherToken },
    });
    expect(stolen.statusCode).toBe(428);

    const token = await confirmFor("+79280000001", "login");
    const ok = await app.inject({
      method: "POST",
      url: "/auth/call/login",
      payload: { phone: "+7 928 000-00-01", verificationToken: token },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.id).toBe("u1");
    const again = await app.inject({
      method: "POST",
      url: "/auth/call/login",
      payload: { phone: "+79280000001", verificationToken: token },
    });
    expect(again.statusCode).toBe(428);
    await app.close();
  });

  it("заблокированный аккаунт звонком не входит", async () => {
    const provider = new FakeProvider();
    const { app, fake, confirmFor } = await buildAuthApp(provider);
    const u1 = fake.accounts.get("u1");
    if (u1) u1.user_status = "banned";
    const token = await confirmFor("+79280000001", "login");
    const res = await app.inject({
      method: "POST",
      url: "/auth/call/login",
      payload: { phone: "+79280000001", verificationToken: token },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("account_blocked");
    await app.close();
  });

  it("пароль выключен: вход по паролю — 403 с подсказкой, нет номера — 404 для старых сборок", async () => {
    const provider = new FakeProvider();
    const { app } = await buildAuthApp(provider);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: "+79280000001", password: "whatever1" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("password_login_disabled");
    expect(res.json().error).toContain("Забыли пароль?");
    const unknown = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: "+79289999999", password: "whatever1" },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().code).toBe("account_not_found");
    const opts = await app.inject({ method: "GET", url: "/auth/options" });
    expect(opts.json()).toMatchObject({ phoneCallLogin: true, passwordLogin: false });
    await app.close();
  });

  it("флаг возвращает вход по паролю", async () => {
    const provider = new FakeProvider();
    const { app } = await buildAuthApp(provider, { PASSWORD_LOGIN_ENABLED: true });
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { login: "+79280000001", password: "wrong-pass" },
    });
    expect(res.statusCode).toBe(401);
    const opts = await app.inject({ method: "GET", url: "/auth/options" });
    expect(opts.json().passwordLogin).toBe(true);
    await app.close();
  });

  it("регистрация без пароля: аккаунт с хешем, которым не войти", async () => {
    const provider = new FakeProvider();
    const { app, fake, confirmFor } = await buildAuthApp(provider);
    const token = await confirmFor("+79285555555", "register");
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { firstName: "Ада", phone: "+79285555555", verificationToken: token },
    });
    expect(res.statusCode).toBe(201);
    const call = fake.calls.find((c) => c.sql.includes("register_account"));
    expect(String(call?.params[1])).toMatch(/^\$2[ab]\$10\$/);
    await app.close();
  });
});

describe("тестовые номера без звонка (№380)", () => {
  it("разбор списка: только мобильные номера России", () => {
    expect([...parseTestPhones("+7 928 000-00-00, 89281112233, 123, 79281112233")]).toEqual([
      "+79280000000",
      "+79281112233",
    ]);
  });

  it("номер ревьюера входит без звонка и без провайдера; о входе — уведомление", async () => {
    const provider = new FakeProvider();
    const { app, fake } = await buildAuthApp(provider, {
      CALLCHECK_TEST_PHONES: "+79280000001",
    });
    const start = await app.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone: "+79280000001", purpose: "login" },
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().callPhonePretty).toBe("Звонить не нужно");
    expect(provider.adds).toBe(0);
    const status = await app.inject({
      method: "POST",
      url: "/auth/call/status",
      payload: { phone: "+79280000001", secret: start.json().secret },
    });
    expect(status.json().confirmed).toBe(true);
    const login = await app.inject({
      method: "POST",
      url: "/auth/call/login",
      payload: { phone: "+79280000001", verificationToken: status.json().verificationToken },
    });
    expect(login.statusCode).toBe(200);
    expect(
      fake.calls.some(
        (c) => c.sql.includes("notify_security_event") && c.params[1] === "new_sign_in",
      ),
    ).toBe(true);
    await app.close();
  });

  it("тестовый номер: не вход и не в аккаунт сотрудника — отказ", async () => {
    const provider = new FakeProvider();
    const { app, fake } = await buildAuthApp(provider, {
      CALLCHECK_TEST_PHONES: "+79280000001, +79280000002, +79287777777",
    });
    for (const purpose of ["register", "recover", "change_phone"]) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/call/start",
        payload: { phone: "+79280000001", purpose },
        headers: { authorization: "Bearer access-u1" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("phone_not_allowed");
    }
    fake.staff.add("u2");
    const admin = await app.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone: "+79280000002", purpose: "login" },
    });
    expect(admin.statusCode).toBe(403);
    const none = await app.inject({
      method: "POST",
      url: "/auth/call/start",
      payload: { phone: "+79287777777", purpose: "login" },
    });
    expect(none.statusCode).toBe(403);
    expect(provider.adds).toBe(0);
    await app.close();
  });
});
