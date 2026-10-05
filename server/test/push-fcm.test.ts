import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fcmConfigured, loadConfig } from "../src/config.js";
import {
  buildFcmPayload,
  FcmClient,
  isDeadFcmResponse,
  parseFcmError,
  readFcmServiceAccount,
} from "../src/push/fcm.js";
import { ANDROID_CHANNEL_ID } from "../src/push/rustore.js";

const BASE_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/postgres",
  JWT_SECRET: "x".repeat(40),
};

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ACCOUNT = {
  project_id: "xtrud-test",
  client_email: "push@xtrud-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("конфигурация FCM", () => {
  it("работает без него: настройка необязательна", () => {
    const cfg = loadConfig({ ...BASE_ENV } as unknown as NodeJS.ProcessEnv);
    expect(fcmConfigured(cfg)).toBe(false);
  });

  it("требует общий секрет, иначе отправку мог бы вызвать любой", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        FCM_SERVICE_ACCOUNT_PATH: "/secrets/fcm.json",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/NOTIFY_SECRET/);
  });

  it("с ключом и секретом считается настроенным", () => {
    const cfg = loadConfig({
      ...BASE_ENV,
      FCM_SERVICE_ACCOUNT_PATH: "/secrets/fcm.json",
      NOTIFY_SECRET: "s".repeat(32),
    } as unknown as NodeJS.ProcessEnv);
    expect(fcmConfigured(cfg)).toBe(true);
  });

  it("испорченный ключ роняет запуск, а не первое уведомление", () => {
    const dir = mkdtempSync(join(tmpdir(), "fcm-"));
    const path = join(dir, "key.json");
    writeFileSync(path, JSON.stringify({ project_id: "p" }));
    expect(() => readFcmServiceAccount(path)).toThrow(/private_key/);
    writeFileSync(path, JSON.stringify(ACCOUNT));
    expect(readFcmServiceAccount(path).project_id).toBe("xtrud-test");
  });
});

describe("тело уведомления FCM", () => {
  it("несёт title, body, канал и высокий приоритет", () => {
    const payload = buildFcmPayload("device-1", {
      title: "Новый отклик",
      body: "Ахмед откликнулся на задание",
      data: { type: "order_response", order_id: 42 },
      badge: 3,
    }) as { message: Record<string, unknown> };
    expect(payload.message.token).toBe("device-1");
    expect(payload.message.notification).toEqual({
      title: "Новый отклик",
      body: "Ахмед откликнулся на задание",
    });
    expect(payload.message.data).toEqual({ type: "order_response", order_id: "42" });
    expect(payload.message.android).toEqual({
      priority: "high",
      notification: { channel_id: ANDROID_CHANNEL_ID, sound: "default", notification_count: 3 },
    });
  });

  it("без непрочитанных не ставит счётчик", () => {
    const payload = buildFcmPayload("d", { title: "t", body: "b", data: {}, badge: 0 }) as {
      message: { android: { notification: Record<string, unknown> } };
    };
    expect(payload.message.android.notification.notification_count).toBeUndefined();
  });
});

describe("мёртвый токен FCM", () => {
  it("UNREGISTERED и чужой проект — удалить", () => {
    expect(isDeadFcmResponse(404, "UNREGISTERED", "Requested entity was not found.")).toBe(true);
    expect(isDeadFcmResponse(403, "SENDER_ID_MISMATCH", null)).toBe(true);
  });

  it("неверный токен — удалить, ошибка в теле запроса — нет", () => {
    expect(
      isDeadFcmResponse(
        400,
        "INVALID_ARGUMENT",
        "The registration token is not a valid FCM registration token",
      ),
    ).toBe(true);
    expect(isDeadFcmResponse(400, "INVALID_ARGUMENT", "Invalid value at 'message.data'")).toBe(
      false,
    );
  });

  it("наш ключ, лимит, сбой Google и неверный проект токен не удаляют", () => {
    expect(isDeadFcmResponse(401, "UNAUTHENTICATED", null)).toBe(false);
    expect(isDeadFcmResponse(429, "QUOTA_EXCEEDED", null)).toBe(false);
    expect(isDeadFcmResponse(503, "UNAVAILABLE", null)).toBe(false);
    expect(isDeadFcmResponse(404, "NOT_FOUND", "Project not found")).toBe(false);
  });

  it("errorCode берётся из деталей ответа", () => {
    const raw = JSON.stringify({
      error: {
        code: 404,
        status: "NOT_FOUND",
        message: "Requested entity was not found.",
        details: [
          {
            "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
            errorCode: "UNREGISTERED",
          },
        ],
      },
    });
    expect(parseFcmError(raw)).toEqual({
      code: "UNREGISTERED",
      message: "Requested entity was not found.",
    });
    expect(parseFcmError("не json").code).toBeNull();
  });
});

describe("клиент FCM", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("берёт токен доступа один раз и шлёт в проект из ключа", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        calls.push({ url, auth: headers.get("authorization") });
        if (url.startsWith("https://token.test")) {
          return new Response(JSON.stringify({ access_token: "access-1", expires_in: 3599 }));
        }
        return new Response(JSON.stringify({ name: "projects/xtrud-test/messages/1" }));
      }),
    );
    const client = new FcmClient({
      account: ACCOUNT,
      tokenUrl: "https://token.test/token",
      fcmBaseUrl: "https://fcm.test",
    });
    const msg = { title: "t", body: "b", data: {} };
    expect(await client.send("d1", msg)).toEqual({
      deviceToken: "d1",
      status: 200,
      reason: null,
      gone: false,
    });
    await client.send("d2", msg);
    expect(calls.filter((c) => c.url.startsWith("https://token.test"))).toHaveLength(1);
    expect(calls[1]).toEqual({
      url: "https://fcm.test/v1/projects/xtrud-test/messages:send",
      auth: "Bearer access-1",
    });
  });

  it("сеть упала — токен устройства живой", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const client = new FcmClient({ account: ACCOUNT, tokenUrl: "https://token.test/token" });
    const r = await client.send("d1", { title: "t", body: "b", data: {} });
    expect(r.status).toBe(0);
    expect(r.gone).toBe(false);
  });
});
