/**
 * Pure-helpers для master feed badge / realtime инвалидации.
 *
 * Вынесено из `use-unread-feed.ts` отдельно, чтобы покрыть unit-тестами
 * в Node без supabase / TanStack Query. Паттерн как с `feed-page.ts`
 * и `image-resize.ts` (sprint 19).
 *
 * Покрывает 3 вещи:
 *   1. `unreadFeedKey` — стабильная queryKey (порядок l2Ids не влияет).
 *   2. `unreadResponsesKey` — то же для client-side badge.
 *   3. `shouldInvalidateFeedOnInsert` — pure-фильтр: должен ли новый
 *      `orders.row` (из Realtime INSERT payload) триггерить invalidation
 *      для текущего мастера.
 */

export function unreadFeedKey(
  userId: string | undefined,
  l2Ids: string[],
): readonly ["unread-feed", string | undefined, string] {
  return ["unread-feed", userId, l2Ids.slice().sort().join(",")] as const;
}

export function unreadResponsesKey(
  userId: string | undefined,
): readonly ["unread-responses", string | undefined] {
  return ["unread-responses", userId] as const;
}

/**
 * Минимальный shape новой строки orders, который нам важен.
 * Realtime payload отдаёт NEW как любой Record<string, unknown> — функция
 * сама делает defensive typeof-проверки.
 */
export interface OrderRowMinimal {
  status?: string | null;
  client_id?: string | null;
  l2_id?: string | null;
}

/**
 * Должен ли новый order (из realtime INSERT) триггерить invalidation feed?
 *
 * Условия (все одновременно):
 *  - status = 'open' (только новые открытые заказы интересны мастеру)
 *  - client_id != userId (свои заказы из feed мы вычитаем)
 *  - l2_id входит в мои категории (l2Ids)
 *
 * Не получает зависимости от lastSeenAt — это нужно только для COUNT-запроса,
 * не для решения «инвалидировать или нет».
 */
export function shouldInvalidateFeedOnInsert(
  row: OrderRowMinimal,
  userId: string,
  l2Ids: string[],
): boolean {
  if (row.status !== "open") return false;
  if (!row.client_id || row.client_id === userId) return false;
  if (!row.l2_id || !l2Ids.includes(row.l2_id)) return false;
  return true;
}
