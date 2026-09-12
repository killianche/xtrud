// Отправка push на Android через RuStore (VK Push Notification Service).
//
// Почему не FCM: наш канал распространения — RuStore, а он работает и на
// телефонах без сервисов Google (Huawei). DECISION владельца 2026-09-12.
//
// Протокол (проверено по документации RuStore 2026-09-12):
//   POST https://vkpns.rustore.ru/v1/projects/<projectId>/messages:send
//   Authorization: Bearer <сервисный токен из RuStore Консоль>
//   { "message": { "token": "<токен устройства>", "notification": {...},
//                  "data": {...}, "android": { "notification": {...} } } }
// Успех — 200 с пустым телом. Ошибки: 400 INVALID_ARGUMENT (токен не тот),
// 404 NOT_FOUND (токен истёк), 403 PERMISSION_DENIED (сервисный токен),
// 429 TOO_MANY_REQUESTS, 500 INTERNAL.
//
// Важное отличие от Apple: доставка возможна только если на телефоне стоит
// RuStore, пользователь в нём авторизован, приложению разрешена фоновая
// работа, а отпечаток подписи сборки заведён в Консоли. Поэтому отсутствие
// доставки — обычное состояние, а не отказ сервера: уведомление в любом
// случае уже записано в базу и видно на экране «Уведомления».
import type { DeliveryResult, PushMessage } from "./apns.js";

export interface RuStorePushConfig {
  /** Project ID из раздела «Push-уведомления → Проекты» в RuStore Консоль. */
  projectId: string;
  /** Сервисный токен того же проекта. */
  serviceToken: string;
  /** Базовый адрес; переопределяется только в тестах. */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://vkpns.rustore.ru";

/** Свой предел ожидания: у вызывающей базы таймаут две секунды. */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Канал уведомлений Android. Тот же идентификатор создаёт expo-notifications
 * на устройстве; без него система покажет уведомление в канале по умолчанию.
 */
export const ANDROID_CHANNEL_ID = "default";

/**
 * Полезная нагрузка приложения передаётся строками: transport принимает
 * `data` как словарь строк, и число или объект там молча теряются.
 */
export function stringifyData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

/** Тело запроса к RuStore. `notification` обязателен: без title push не покажут. */
export function buildRuStorePayload(
  deviceToken: string,
  message: PushMessage,
): Record<string, unknown> {
  return {
    message: {
      token: deviceToken,
      notification: { title: message.title, body: message.body },
      android: {
        notification: { channel_id: ANDROID_CHANNEL_ID },
      },
      data: stringifyData(message.data),
    },
  };
}

/**
 * Токен устройства больше не действителен: приложение удалили, RuStore
 * разлогинили или токен выдан другому проекту. Такой токен удаляем, иначе он
 * копится и каждое уведомление тратит на него запрос.
 *
 * 403 — это про наш сервисный токен, а не про устройство; 429 и 5xx —
 * временные. Их не удаляем.
 */
export function isDeadRuStoreStatus(status: number): boolean {
  return status === 400 || status === 404;
}

export class RuStorePushClient {
  private readonly cfg: RuStorePushConfig;

  constructor(cfg: RuStorePushConfig) {
    this.cfg = cfg;
  }

  async send(deviceToken: string, message: PushMessage): Promise<DeliveryResult> {
    const url = `${this.cfg.baseUrl ?? DEFAULT_BASE_URL}/v1/projects/${encodeURIComponent(
      this.cfg.projectId,
    )}/messages:send`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.cfg.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildRuStorePayload(deviceToken, message)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const raw = await response.text();
      let reason: string | null = null;
      if (raw.length > 0 && response.status !== 200) {
        try {
          const parsed = JSON.parse(raw) as { code?: string; message?: string };
          reason = parsed.code ?? parsed.message ?? null;
        } catch {
          reason = raw.slice(0, 120);
        }
      }
      return {
        deviceToken,
        status: response.status,
        reason,
        gone: isDeadRuStoreStatus(response.status),
      };
    } catch (e) {
      // Сеть или таймаут: статус 0, токен живой — повторим при следующем
      // уведомлении.
      return { deviceToken, status: 0, reason: (e as Error).message, gone: false };
    }
  }
}
