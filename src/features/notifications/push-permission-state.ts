/**
 * Что сказать человеку о разрешении на уведомления. Отдельный файл без
 * нативных модулей: решение — чистая функция, её проверяет тест.
 *
 * iOS задаёт системный вопрос о уведомлениях один раз за установку. После
 * «Не разрешать» canAskAgain = false, и вернуть уведомления можно только в
 * настройках iPhone — приложение обязано об этом сказать (владелец,
 * 2026-09-10: тестировщик Юсуф оставался без уведомлений и не знал об этом).
 */

export type PushPermissionState =
  /** Разрешено — говорить нечего. */
  | "granted"
  /** Ещё не спрашивали — можно спросить прямо из приложения. */
  | "undetermined"
  /** Запрещено — поможет только настройка iPhone. */
  | "denied"
  /** Симулятор или ошибка чтения — строку не показываем. */
  | "unavailable";

export function pushPermissionState(permission: {
  granted: boolean;
  canAskAgain: boolean;
}): PushPermissionState {
  if (permission.granted) return "granted";
  return permission.canAskAgain ? "undetermined" : "denied";
}
