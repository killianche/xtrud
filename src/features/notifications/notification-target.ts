/**
 * Куда ведёт уведомление — одно правило для строки на экране «Уведомления»
 * и для нажатия на push.
 *
 * Отзыв ведёт в свой профиль: отзывы лежат там, где их видят клиенты
 * (владелец, 2026-09-11: «получил отзыв и нигде не увидел»). Всё, что
 * связано с заданием, — в само задание.
 */

export type NotificationData = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notificationTargetFromData(
  data: NotificationData | null | undefined,
  userId: string | null | undefined,
): string | null {
  const d = data ?? {};
  if (d.type === "review_received") return userId ? `/master/${userId}` : null;
  const orderId = typeof d.order_id === "string" && UUID.test(d.order_id) ? d.order_id : null;
  return orderId ? `/orders/${orderId}` : null;
}

function asObject(value: unknown): NotificationData {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as NotificationData)
    : {};
}

/**
 * Данные push. Наш сервер кладёт их в корень тела рядом с `aps`
 * (server/src/push/apns.ts), а expo-notifications на iOS отдаёт в
 * `content.data` только ключ `body` — формат сервиса Expo Push, которого у
 * нас нет. Поэтому читаем и полное тело из триггера; служебный `aps`
 * отбрасываем.
 */
export function mergePushData(contentData: unknown, triggerPayload: unknown): NotificationData {
  const { aps: _aps, ...payload } = asObject(triggerPayload);
  return { ...payload, ...asObject(contentData) };
}
