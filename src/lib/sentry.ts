/**
 * Sentry — отслеживание сбоев (crash reporting).
 *
 * Зачем: чтобы видеть реальные ошибки у пользователей (белый экран, падение,
 * необработанное исключение) с устройства, а не узнавать о них из жалоб.
 * Пункт 6 предзапускового аудита 2026-05-28.
 *
 * Дизайн «безопасно без ключа»:
 *   - DSN (ключ проекта Sentry) читается из env `EXPO_PUBLIC_SENTRY_DSN`.
 *   - Если ключа НЕТ → Sentry не инициализируется, `reportError` — тихий no-op.
 *     Приложение работает как обычно, ничего не падает, никаких ошибок в консоль.
 *   - Если ключ ЕСТЬ → Sentry включается автоматически (web + iOS + Android).
 *
 * Что от владельца нужно для включения: создать бесплатный проект на sentry.io,
 * скопировать DSN и положить в `.env.local` (локально) + EAS/CI secrets (сборки):
 *     EXPO_PUBLIC_SENTRY_DSN=https://...ingest.sentry.io/...
 * После этого пересобрать приложение — отчёты о сбоях начнут приходить.
 *
 * Нативные крэши (iOS/Android) дополнительно требуют config-plugin
 * `@sentry/react-native/expo` (добавлен в app.json) + новую сборку через EAS.
 * На web достаточно одного DSN.
 *
 * Источники истины: docs Sentry RN (Context7 /getsentry/sentry-react-native).
 */

import * as Sentry from "@sentry/react-native";

// DSN читаем напрямую из process.env (а не из src/lib/env.ts), чтобы:
//  - не делать его обязательным в общей валидации env,
//  - сохранить inlining Expo (process.env.EXPO_PUBLIC_* заменяется на этапе сборки).
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Включаем Sentry только при наличии непустого DSN.
const ENABLED = typeof DSN === "string" && DSN.trim().length > 0;

let initialized = false;

/**
 * Инициализация Sentry. Вызвать один раз как можно раньше (в корне приложения).
 * Без DSN — ничего не делает (безопасно).
 */
export function initSentry(): void {
  if (!ENABLED || initialized) return;

  Sentry.init({
    dsn: DSN,
    // Доля трассировок производительности. На старте держим низко — нам нужны
    // прежде всего ошибки, а не профилирование (можно поднять позже).
    tracesSampleRate: 0.1,
    // В разработке не шлём события на сервер Sentry (чтобы не засорять проект
    // ошибками с локальной машины), но включаем debug-логи в консоль.
    enabled: !__DEV__,
    debug: __DEV__,
    // Метка окружения — отличать прод от дев в дашборде Sentry.
    environment: __DEV__ ? "development" : "production",
  });

  initialized = true;
}

/**
 * Отправить ошибку в Sentry вручную. Без DSN — тихий no-op.
 * Используется в корневом AppErrorBoundary и в местах, где мы ловим ошибку
 * сами (catch) и хотим, чтобы она не потерялась.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!ENABLED || !initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Включён ли Sentry (есть ли DSN). Для условной логики/диагностики. */
export const isSentryEnabled = ENABLED;
