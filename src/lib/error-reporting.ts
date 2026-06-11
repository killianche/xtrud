/**
 * Журнал ошибок приложения → таблица `client_errors` в Supabase.
 *
 * Зачем: в App Store-версии build 10 у нас не было НИКАКОЙ видимости ошибок
 * (Sentry без DSN неактивен). Пользователь сообщил «нажал кнопку — приложение
 * закрылось», а мы не могли узнать причину. Этот модуль решает обе проблемы:
 *
 *   1. `installGlobalErrorHandlers()` — перехватывает необработанные JS-ошибки
 *      (включая ошибки в onPress-обработчиках, которые НЕ ловит ErrorBoundary)
 *      и необработанные promise-rejections. В release-сборке БЕЗ перехвата
 *      такая ошибка = немедленное закрытие приложения. С перехватом —
 *      приложение продолжает работать, а ошибка улетает в журнал.
 *   2. `reportClientError()` — отправка ошибки в `client_errors` (write-only
 *      таблица: клиент может только вставлять, читаем мы через service_role).
 *
 * Дизайн:
 *   - fire-and-forget: отправка никогда не бросает и не блокирует UI;
 *   - дедупликация: одинаковое сообщение шлём не чаще раза в 30 сек
 *     (защита от бесконечного цикла ошибка→отчёт→ошибка);
 *   - в dev (__DEV__) поведение RN не меняем — red box остаётся.
 *
 * Чтение журнала (для владельца/агента):
 *   select created_at, platform, is_fatal, message, context
 *   from client_errors order by created_at desc limit 50;
 *
 * Sentry: остаётся в `src/lib/sentry.ts` — когда появится DSN, оба канала
 * будут работать параллельно (Sentry богаче, наш журнал — независимый).
 */

import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

// Версия приложения для журнала. expo-constants даёт версию из app.json.
// Ленивый require внутри try — если модуль недоступен, журнал работает без версии.
function getAppVersion(): string | null {
  try {
    const Constants = require("expo-constants").default;
    return Constants?.expoConfig?.version ?? null;
  } catch {
    return null;
  }
}

const appVersion = getAppVersion();

// Дедуп: message → timestamp последней отправки.
const lastSentAt = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

function toMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return String(error);
  }
}

function toStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) return error.stack.slice(0, 11_000);
  return null;
}

/**
 * Отправить ошибку в журнал client_errors. Никогда не бросает.
 * @param context короткая строка «где случилось» (например "global-handler",
 *                "error-boundary", "tab-press"). До 400 символов.
 */
export function reportClientError(
  error: unknown,
  options?: { fatal?: boolean; context?: string },
): void {
  try {
    const message = toMessage(error).slice(0, 1900);

    const now = Date.now();
    const last = lastSentAt.get(message) ?? 0;
    if (now - last < DEDUPE_WINDOW_MS) return;
    lastSentAt.set(message, now);

    // user_id берём из текущей сессии, если есть (без await — synchronous getSession
    // недоступен, поэтому цепочкой; ошибка получения сессии не мешает отправке).
    void (async () => {
      let userId: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        userId = data.session?.user?.id ?? null;
      } catch {
        /* без user_id */
      }
      try {
        await supabase.from("client_errors").insert({
          user_id: userId,
          platform: (Platform.OS === "ios" || Platform.OS === "android"
            ? Platform.OS
            : "web") as "ios" | "android" | "web",
          app_version: appVersion,
          is_fatal: options?.fatal ?? false,
          message,
          stack: toStack(error),
          context: options?.context?.slice(0, 400) ?? null,
        });
      } catch {
        /* журнал недоступен — молча, ничего не ломаем */
      }
    })();
  } catch {
    /* никогда не бросаем из отчётчика */
  }
}

let installed = false;

/**
 * Установить глобальные перехватчики ошибок. Вызвать один раз в корне
 * приложения (app/_layout.tsx), как можно раньше.
 *
 * 1. ErrorUtils.setGlobalHandler — необработанные JS-исключения (в т.ч. из
 *    onPress). В release БЕЗ перехвата RN закрывает приложение. Мы: пишем в
 *    журнал; для НЕ-fatal продолжаем работу; исходному обработчику отдаём
 *    только в dev (red box) — в release не пробрасываем, чтобы не закрывать
 *    приложение из-за поправимой ошибки.
 * 2. Tracking необработанных promise-rejections (стандартный механизм
 *    promise/setimmediate/rejection-tracking, который использует сам RN) —
 *    такие ошибки приложение не закрывают, но мы хотим их видеть в журнале.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // --- 1. Необработанные исключения ---------------------------------------
  try {
    // ErrorUtils — глобальный объект RN (на web отсутствует → guard).
    const errorUtils = (globalThis as Record<string, unknown>).ErrorUtils as
      | {
          getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
          setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
        }
      | undefined;

    if (errorUtils?.setGlobalHandler) {
      const previousHandler = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error, isFatal) => {
        reportClientError(error, { fatal: !!isFatal, context: "global-handler" });
        if (__DEV__) {
          // В dev сохраняем red box — отладка важнее.
          previousHandler(error, isFatal);
        }
        // В release НЕ пробрасываем: дефолтный обработчик закрыл бы приложение.
        // Ошибка уже в журнале; экран остаётся жив (для render-ошибок есть
        // AppErrorBoundary с экраном «что-то пошло не так»).
      });
    }
  } catch {
    /* не удалось — работаем без перехвата исключений */
  }

  // --- 2. Необработанные promise-rejections --------------------------------
  try {
    // Тот же модуль, которым RN включает предупреждения о rejections.
    // Ленивый require: на web/Hermes структура может отличаться — всё в try.
    const tracking = require("promise/setimmediate/rejection-tracking") as {
      enable: (opts: {
        allRejections: boolean;
        onUnhandled: (id: number, error: unknown) => void;
      }) => void;
    };
    tracking.enable({
      allRejections: true,
      onUnhandled: (_id, error) => {
        reportClientError(error, { fatal: false, context: "unhandled-rejection" });
        if (__DEV__) {
          console.warn("[error-reporting] unhandled promise rejection:", error);
        }
      },
    });
  } catch {
    /* трекинг недоступен — пропускаем */
  }
}
