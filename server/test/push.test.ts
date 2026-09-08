import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildApnsPayload, isDeadTokenReason } from "../src/push/apns.js";

const BASE_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/postgres",
  JWT_SECRET: "x".repeat(40),
};

describe("конфигурация APNs", () => {
  it("работает без push: настройка целиком необязательна", () => {
    const cfg = loadConfig({ ...BASE_ENV } as unknown as NodeJS.ProcessEnv);
    expect(cfg.APNS_KEY_ID).toBeUndefined();
  });

  it("не стартует при половинчатой настройке", () => {
    expect(() =>
      loadConfig({ ...BASE_ENV, APNS_KEY_ID: "JA68TDB879" } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/наполовину/);
  });

  it("отвергает заглушку вместо идентификатора Apple", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        APNS_KEY_PATH: "/tmp/key.p8",
        APNS_KEY_ID: "ВАШ_KEY_ID",
        APNS_TEAM_ID: "ZNK264PD9Y",
        NOTIFY_SECRET: "s".repeat(32),
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/APNS_KEY_ID/);
  });

  it("требует общий секрет, иначе отправку мог бы вызвать любой", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        APNS_KEY_PATH: "/tmp/key.p8",
        APNS_KEY_ID: "JA68TDB879",
        APNS_TEAM_ID: "ZNK264PD9Y",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/NOTIFY_SECRET/);
  });
});

describe("тело уведомления", () => {
  it("кладёт свои поля рядом с aps, а не внутрь", () => {
    const payload = buildApnsPayload({
      title: "Новый отклик",
      body: "Кто-то откликнулся на задание",
      data: { type: "response", order_id: "abc" },
      badge: 3,
    });
    expect(payload.aps).toEqual({
      alert: { title: "Новый отклик", body: "Кто-то откликнулся на задание" },
      sound: "default",
      badge: 3,
    });
    expect(payload.type).toBe("response");
    expect(payload.order_id).toBe("abc");
  });

  it("не шлёт badge, когда считать нечего", () => {
    const payload = buildApnsPayload({ title: "Привет", body: "", data: {} });
    expect(payload.aps).not.toHaveProperty("badge");
  });
});

describe("мёртвые токены", () => {
  it("узнаёт ответы Apple, после которых токен надо удалить", () => {
    expect(isDeadTokenReason("BadDeviceToken")).toBe(true);
    expect(isDeadTokenReason("Unregistered")).toBe(true);
  });

  it("не удаляет токен из-за временной неполадки", () => {
    expect(isDeadTokenReason("TooManyRequests")).toBe(false);
    expect(isDeadTokenReason("InternalServerError")).toBe(false);
    expect(isDeadTokenReason(null)).toBe(false);
  });
});
