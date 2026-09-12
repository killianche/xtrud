import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  ANDROID_CHANNEL_ID,
  buildRuStorePayload,
  isDeadRuStoreStatus,
  stringifyData,
} from "../src/push/rustore.js";

const BASE_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/postgres",
  JWT_SECRET: "x".repeat(40),
};

describe("конфигурация RuStore push", () => {
  it("работает без него: настройка целиком необязательна", () => {
    const cfg = loadConfig({ ...BASE_ENV } as unknown as NodeJS.ProcessEnv);
    expect(cfg.RUSTORE_PUSH_PROJECT_ID).toBeUndefined();
  });

  it("не стартует при половинчатой настройке", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        RUSTORE_PUSH_PROJECT_ID: "project-1",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/наполовину/);
  });

  it("требует общий секрет, иначе отправку мог бы вызвать любой", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        RUSTORE_PUSH_PROJECT_ID: "project-1",
        RUSTORE_PUSH_SERVICE_TOKEN: "t".repeat(32),
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/NOTIFY_SECRET/);
  });
});

describe("тело уведомления RuStore", () => {
  it("несёт title и body: без title push не показывают", () => {
    const payload = buildRuStorePayload("device-1", {
      title: "Новый отклик",
      body: "Ахмед откликнулся на задание",
      data: { type: "order_response", order_id: "42" },
    }) as { message: Record<string, unknown> };
    expect(payload.message.token).toBe("device-1");
    expect(payload.message.notification).toEqual({
      title: "Новый отклик",
      body: "Ахмед откликнулся на задание",
    });
    expect(payload.message.android).toEqual({
      notification: { channel_id: ANDROID_CHANNEL_ID },
    });
  });

  it("передаёт свои поля строками: число и объект иначе теряются", () => {
    expect(stringifyData({ count: 3, nested: { a: 1 }, text: "как есть", skip: null })).toEqual({
      count: "3",
      nested: '{"a":1}',
      text: "как есть",
    });
  });
});

describe("мёртвые токены RuStore", () => {
  it("удаляет токен, который сервис не признал", () => {
    expect(isDeadRuStoreStatus(400)).toBe(true);
    expect(isDeadRuStoreStatus(404)).toBe(true);
  });

  it("не удаляет из-за нашего сервисного токена или временной неполадки", () => {
    expect(isDeadRuStoreStatus(403)).toBe(false);
    expect(isDeadRuStoreStatus(429)).toBe(false);
    expect(isDeadRuStoreStatus(500)).toBe(false);
    expect(isDeadRuStoreStatus(0)).toBe(false);
  });
});
