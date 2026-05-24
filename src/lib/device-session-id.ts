/**
 * Стабильный device-session-id для дедупа просмотров мастера.
 *
 * Контракт:
 *   - Логиновый пользователь → анти-абуз делает RPC через auth.uid(), но
 *     session_id всё равно нужен (на web/native session_id хранится отдельно
 *     от auth-сессии). Используем тот же uuid v4 что и для анонов.
 *   - Аноны → uuid v4 живёт в SecureStore (native) / localStorage (web).
 *
 * История: создан 2026-05-20 для master profile views counter (см. миграция
 * 0096_master_views).
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "xtrud_device_session_id";

function uuid(): string {
  // RFC4122 v4 без зависимостей. Math.random — для дедупа достаточно
  // (не криптография, важна только уникальность per device).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export async function getDeviceSessionId(): Promise<string> {
  if (cached) return cached;
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return uuid();
      let stored = window.localStorage.getItem(KEY);
      if (!stored) {
        stored = uuid();
        window.localStorage.setItem(KEY, stored);
      }
      cached = stored;
      return stored;
    }
    let stored = await SecureStore.getItemAsync(KEY);
    if (!stored) {
      stored = uuid();
      await SecureStore.setItemAsync(KEY, stored);
    }
    cached = stored;
    return stored;
  } catch {
    // SecureStore сломан — генерируем эфемерный id (статистика будет дублироваться,
    // но это не критично — server-side dedup всё равно сработает).
    cached = uuid();
    return cached;
  }
}
