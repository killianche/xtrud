/**
 * Push на Android — через RuStore (DECISION владельца 2026-09-12).
 *
 * Почему не FCM: приложение раздаётся через RuStore, и его сервис доставки
 * работает на телефонах без сервисов Google — Huawei в том числе.
 *
 * Чего этот путь не может: RuStore доставляет push, только если на телефоне
 * установлен RuStore, человек в нём авторизован и приложению разрешена
 * фоновая работа (условия доставки в документации RuStore). Поэтому
 * недоступность — обычное состояние, а не ошибка: уведомления всё равно
 * видны на экране «Уведомления», а счётчики приходят живым каналом
 * `/v2/events`.
 *
 * Модуль подключается к приложению только на Android. На iOS и web ничего
 * не грузим: там push идёт через APNs (`use-register-push-token.ts`).
 */

import { Platform } from "react-native";

/**
 * Имена событий — это имена элементов перечисления `PushEvents` в SDK
 * (`ON_OPENED`, `ON_MESSAGE_RECEIVED`), а не произвольные строки: проверено
 * по исходникам react-native-rustore-push 6.9.1.
 */
export const RUSTORE_ON_OPENED = "ON_OPENED";

/** Сообщение от SDK: свои поля лежат в `data` строками. */
export interface RuStoreRemoteMessage {
  data?: Record<string, unknown>;
}

interface RuStorePushModule {
  getToken: () => Promise<string>;
  deleteToken: () => Promise<boolean>;
  checkPushAvailability: () => Promise<boolean>;
  /** Без этого вызова SDK не шлёт события в JS. */
  createPushEmitter: () => void;
  getInitialNotification: () => Promise<RuStoreRemoteMessage | null>;
}

interface RuStorePushBinding {
  client: RuStorePushModule;
  events: {
    addListener: (
      name: string,
      handler: (message: RuStoreRemoteMessage) => void,
    ) => { remove: () => void };
  };
}

/**
 * Загружаем модуль лениво и через require: на iOS его в сборке нет, а
 * статический import уронил бы бандл. Результат запоминаем — включая
 * неудачу, чтобы не пытаться на каждый экран.
 */
let cached: RuStorePushBinding | null | undefined;

export function rustorePush(): RuStorePushBinding | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== "android") {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-rustore-push");
    const client = (mod.default ?? mod) as RuStorePushModule;
    const events = mod.eventEmitter as RuStorePushBinding["events"] | undefined;
    cached = typeof client?.getToken === "function" && events ? { client, events } : null;
  } catch {
    // Сборка без модуля (например, старый APK) — Android просто без push.
    cached = null;
  }
  return cached;
}

/**
 * Токен устройства для RuStore. `null` — доставка на этом телефоне
 * невозможна: нет RuStore, человек в нём не авторизован или модуля нет в
 * сборке. Это не ошибка и не повод для отчёта об ошибке.
 */
export async function rustoreDeviceToken(): Promise<string | null> {
  const binding = rustorePush();
  if (binding === null) return null;
  const available = await binding.client.checkPushAvailability();
  if (!available) return null;
  const token = await binding.client.getToken();
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** Снять токен при выходе, чтобы следующему владельцу телефона не пришли чужие. */
export async function rustoreDeleteToken(): Promise<void> {
  const binding = rustorePush();
  if (binding === null) return;
  await binding.client.deleteToken();
}
