// Отправка push на Android через Firebase Cloud Messaging (HTTP v1).
//
// Почему FCM: приложение распространяется через Google Play, а SDK RuStore
// исключён из Android-сборки (DECISION владельца 2026-10-03). Токен телефона
// выдаёт expo-notifications (`getDevicePushTokenAsync`) — это токен FCM.
//
// Протокол (документация Firebase, HTTP v1):
//   POST https://fcm.googleapis.com/v1/projects/<projectId>/messages:send
//   Authorization: Bearer <OAuth2-токен служебного аккаунта,
//                          scope https://www.googleapis.com/auth/firebase.messaging>
//   { "message": { "token": "...", "notification": {...}, "data": {...},
//                  "android": { "priority": "high", "notification": {...} } } }
// Успех — 200 и { "name": "projects/.../messages/..." }.
// Мёртвый токен — UNREGISTERED (404), SENDER_ID_MISMATCH или 400
// INVALID_ARGUMENT про registration token. 401/403 — наш ключ, 429/5xx —
// временные: такие токены не трогаем.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DeliveryResult, PushMessage } from "./apns.js";
import { ANDROID_CHANNEL_ID, stringifyData } from "./rustore.js";

export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface FcmConfig {
  account: FcmServiceAccount;
  /** Базовые адреса; переопределяются только в тестах. */
  fcmBaseUrl?: string;
  tokenUrl?: string;
}

const DEFAULT_FCM_BASE_URL = "https://fcm.googleapis.com";
const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** Свой предел ожидания: у вызывающей базы таймаут две секунды. */
const REQUEST_TIMEOUT_MS = 5_000;

/** Токен доступа Google живёт час; обновляем раньше, с запасом. */
const ACCESS_TOKEN_TTL_MS = 50 * 60 * 1000;

/** Ключ служебного аккаунта читается на старте: испорченный файл роняет деплой. */
export function readFcmServiceAccount(path: string): FcmServiceAccount {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FcmServiceAccount>;
  if (
    typeof parsed.project_id !== "string" ||
    typeof parsed.client_email !== "string" ||
    typeof parsed.private_key !== "string"
  ) {
    throw new Error("Ключ FCM: нужны project_id, client_email и private_key");
  }
  return parsed as FcmServiceAccount;
}

/** Тело запроса к FCM. `notification` обязателен: без title push не покажут. */
export function buildFcmPayload(
  deviceToken: string,
  message: PushMessage,
): Record<string, unknown> {
  const androidNotification: Record<string, unknown> = {
    channel_id: ANDROID_CHANNEL_ID,
    sound: "default",
  };
  if (typeof message.badge === "number" && message.badge > 0) {
    androidNotification.notification_count = message.badge;
  }
  return {
    message: {
      token: deviceToken,
      notification: { title: message.title, body: message.body },
      data: stringifyData(message.data),
      android: { priority: "high", notification: androidNotification },
    },
  };
}

/**
 * Токен устройства больше не действителен: приложение удалили или токен из
 * другого проекта Firebase. 400 INVALID_ARGUMENT бывает и от ошибки в теле
 * запроса — тогда удалять токены всех получателей нельзя, поэтому такой ответ
 * считается мёртвым токеном, только если FCM прямо пишет про registration
 * token.
 */
export function isDeadFcmResponse(
  status: number,
  errorCode: string | null,
  message: string | null,
): boolean {
  // Голый 404 без UNREGISTERED — это неверный адрес проекта, а не токен.
  if (errorCode === "UNREGISTERED" || errorCode === "SENDER_ID_MISMATCH") return true;
  return (
    status === 400 &&
    errorCode === "INVALID_ARGUMENT" &&
    message !== null &&
    /registration token/i.test(message)
  );
}

/** errorCode из `details[].errorCode` ответа FCM (иначе статус) и текст ошибки. */
export function parseFcmError(raw: string): { code: string | null; message: string | null } {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> };
    };
    const detail = parsed.error?.details?.find((d) => typeof d.errorCode === "string");
    return {
      code: detail?.errorCode ?? parsed.error?.status ?? null,
      message: parsed.error?.message ?? null,
    };
  } catch {
    return { code: null, message: raw.length > 0 ? raw.slice(0, 200) : null };
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export class FcmClient {
  private readonly cfg: FcmConfig;
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(cfg: FcmConfig) {
    this.cfg = cfg;
  }

  /** Подписанный запрос токена доступа (JWT bearer, RFC 7523). */
  private signedAssertion(nowSeconds: number): string {
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: this.cfg.account.client_email,
        scope: SCOPE,
        aud: this.cfg.tokenUrl ?? this.cfg.account.token_uri ?? DEFAULT_TOKEN_URL,
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
    );
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${claims}`)
      .sign(this.cfg.account.private_key, "base64url");
    return `${header}.${claims}.${signature}`;
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cached !== null && this.cached.expiresAt > now) return this.cached.token;
    const response = await fetch(
      this.cfg.tokenUrl ?? this.cfg.account.token_uri ?? DEFAULT_TOKEN_URL,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: this.signedAssertion(Math.floor(now / 1000)),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`FCM: токен доступа не выдан (${response.status})`);
    }
    const body = (await response.json()) as { access_token?: string };
    if (typeof body.access_token !== "string") throw new Error("FCM: пустой токен доступа");
    this.cached = { token: body.access_token, expiresAt: now + ACCESS_TOKEN_TTL_MS };
    return body.access_token;
  }

  async send(deviceToken: string, message: PushMessage): Promise<DeliveryResult> {
    const url = `${this.cfg.fcmBaseUrl ?? DEFAULT_FCM_BASE_URL}/v1/projects/${encodeURIComponent(
      this.cfg.account.project_id,
    )}/messages:send`;
    try {
      const token = await this.accessToken();
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(buildFcmPayload(deviceToken, message)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const raw = await response.text();
      // Ключ отозвали или токен доступа устарел раньше срока — следующий
      // вызов возьмёт новый.
      if (response.status === 401) this.cached = null;
      if (response.status === 200) {
        return { deviceToken, status: 200, reason: null, gone: false };
      }
      const error = parseFcmError(raw);
      return {
        deviceToken,
        status: response.status,
        reason: error.code ?? error.message,
        gone: isDeadFcmResponse(response.status, error.code, error.message),
      };
    } catch (e) {
      // Сеть, таймаут или токен доступа: статус 0, токен устройства живой —
      // повторим при следующем уведомлении.
      return { deviceToken, status: 0, reason: (e as Error).message, gone: false };
    }
  }
}
