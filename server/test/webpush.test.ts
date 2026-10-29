import { describe, expect, it, vi } from "vitest";
import type { Db } from "../src/db.js";
import {
  ADMIN_BASE_URL,
  adminPushMessage,
  dispatchAdminEvent,
  isPushEndpoint,
  parseAdminEvent,
  testAllowed,
  type WebPushSend,
} from "../src/push/webpush.js";

const ID = "659a21f8-a384-4058-9abd-e5e77ec5d5f8";
const log = { info: () => undefined, warn: () => undefined };

describe("parseAdminEvent", () => {
  it("разбирает сигнал своего канала", () => {
    expect(
      parseAdminEvent("xtrud_admin_events", JSON.stringify({ kind: "passport", ref: ID })),
    ).toEqual({
      kind: "passport",
      ref: ID,
      user: null,
    });
  });
  it("чужой канал, мусор и пробное без адресата — не событие", () => {
    expect(parseAdminEvent("xtrud_user_events", JSON.stringify({ kind: "report" }))).toBeNull();
    expect(parseAdminEvent("xtrud_admin_events", "{не json")).toBeNull();
    expect(
      parseAdminEvent("xtrud_admin_events", JSON.stringify({ kind: "DROP TABLE" })),
    ).toBeNull();
    expect(parseAdminEvent("xtrud_admin_events", JSON.stringify({ kind: "test" }))).toBeNull();
  });
});

describe("adminPushMessage", () => {
  it("ведёт в нужный раздел и не содержит ПДн", () => {
    expect(adminPushMessage("order_review", ID)?.path).toBe(`/orders/${ID}`);
    expect(adminPushMessage("experience", null)?.path).toBe("/inbox/experience");
    expect(adminPushMessage("order_review", "../../evil")?.path).toBe("/orders");
    expect(adminPushMessage("unknown", null)).toBeNull();
  });
});

function fakeDb(rows: Array<{ endpoint: string; p256dh: string; auth: string }>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    asService: async (fn: (c: unknown) => Promise<unknown>) =>
      fn({
        query: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return { rows: sql.includes("admin_push_targets") ? rows : [] };
        },
      }),
  } as unknown as Db;
  return { db, calls };
}

describe("dispatchAdminEvent", () => {
  it("шлёт каждой подписке, мёртвые отдаёт на удаление", async () => {
    const { db, calls } = fakeDb([
      { endpoint: "https://web.push.apple.com/a", p256dh: "k", auth: "a" },
      { endpoint: "https://web.push.apple.com/b", p256dh: "k", auth: "a" },
    ]);
    const send: WebPushSend = vi.fn(async (t) => ({
      endpoint: t.endpoint,
      ok: t.endpoint.endsWith("a"),
      gone: t.endpoint.endsWith("b"),
      status: t.endpoint.endsWith("a") ? 201 : 410,
    }));
    const r = await dispatchAdminEvent(db, send, { kind: "passport", ref: ID, user: null }, log);
    expect(r).toEqual({ sent: 1, removed: 1 });
    const payload = JSON.parse((send as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string);
    expect(payload.url).toBe(`${ADMIN_BASE_URL}#/inbox/passport`);
    expect(calls[0]?.params).toEqual(["passport", null]);
    expect(calls[1]?.params).toEqual([
      ["https://web.push.apple.com/a"],
      ["https://web.push.apple.com/b"],
    ]);
  });
  it("неизвестный вид не трогает базу", async () => {
    const { db, calls } = fakeDb([]);
    const send: WebPushSend = vi.fn();
    expect(
      await dispatchAdminEvent(db, send, { kind: "nope", ref: null, user: null }, log),
    ).toEqual({
      sent: 0,
      removed: 0,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("isPushEndpoint", () => {
  it("пропускает push-сервисы и отсекает остальное", () => {
    expect(isPushEndpoint("https://web.push.apple.com/QWE")).toBe(true);
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com@evil.com/x")).toBe(false);
    expect(isPushEndpoint("https://web.push.apple.com:8443/x")).toBe(false);
    expect(isPushEndpoint("http://web.push.apple.com/x")).toBe(false);
    expect(isPushEndpoint("https://evil.notify.windows.com.evil.ru/x")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
  });
});

describe("testAllowed", () => {
  it("не чаще раза в 30 секунд на сотрудника", () => {
    expect(testAllowed("u1", 1_000_000)).toBe(true);
    expect(testAllowed("u1", 1_010_000)).toBe(false);
    expect(testAllowed("u2", 1_010_000)).toBe(true);
    expect(testAllowed("u1", 1_031_000)).toBe(true);
  });
});
