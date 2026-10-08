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
  // Решение по паспорту и снятие значка — на экран подтверждения.
  if (typeof d.type === "string" && d.type.startsWith("verification_")) {
    return "/profile/specialist/verify";
  }
  // Админ скрыл или вернул профиль — в «Я специалист», там виден статус.
  if (d.type === "master_hidden" || d.type === "master_shown") return "/profile/specialist";
  // Значок «Большой опыт» (0225) — в свой профиль, где его видят клиенты.
  if (d.type === "experience_badge") return userId ? `/master/${userId}` : null;
  // Решение по заявке на значок (0245, 0246, №318) — на экран заявки, где
  // видны статус и причина.
  if (d.kind === "company_review") return "/profile/specialist/company";
  if (d.kind === "experience_badge_review") return "/profile/specialist/experience-badge";
  // Админу и управляющему: «Новое задание без категории» (0230/0236) —
  // список «Без категории» в приложении, где назначают категорию (№286).
  if (d.kind === "uncategorized_order") return "/admin/uncategorized";
  // «Новая жалоба» (0240, №288) — очередь жалоб в приложении.
  if (d.kind === "new_report") return "/admin/reports";
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
