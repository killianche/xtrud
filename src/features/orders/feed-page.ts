/**
 * Pure-helpers для keyset-pagination master feed.
 *
 * Вынесено из `use-master-feed.ts`, чтобы покрыть unit-тестами в Node
 * без react-query / supabase. Тестируем здесь две вещи:
 *  1. `masterFeedKey` — стабильность queryKey при разном порядке l2Ids
 *     (TanStack Query сравнивает queryKey reference-equality по элементам;
 *      сортируем l2Ids чтобы [A,B] и [B,A] давали один и тот же кэш-вход).
 *  2. `buildFeedPage` — корректный nextCursor: null если страница неполная,
 *     created_at последней строки если страница полная (=PAGE_SIZE).
 */
export const FEED_PAGE_SIZE = 20;

export function masterFeedKey(
  userId: string | undefined,
  l2Ids: string[],
): readonly ["master-feed", string | undefined, string] {
  return ["master-feed", userId, l2Ids.slice().sort().join(",")] as const;
}

export interface FeedRowMinimal {
  created_at: string;
}

export interface FeedPage<T extends FeedRowMinimal> {
  rows: T[];
  nextCursor: string | null;
}

/**
 * Из массива строк (отсортированных по created_at DESC, как приходят с БД)
 * собираем страницу с next-cursor.
 *
 * Контракт keyset-pagination:
 *  - rows.length < pageSize → пришло меньше чем просили, БД исчерпана → null
 *  - rows.length === pageSize → возможно есть ещё → курсор = created_at последней строки
 *  - rows.length === 0 → null (явный случай empty)
 *  - rows.length > pageSize → теоретически невозможно (SQL .limit), защита от мусорного входа → null
 */
export function buildFeedPage<T extends FeedRowMinimal>(
  rows: T[],
  pageSize: number = FEED_PAGE_SIZE,
): FeedPage<T> {
  if (rows.length === 0 || rows.length !== pageSize) {
    return { rows, nextCursor: null };
  }
  const last = rows[rows.length - 1];
  return { rows, nextCursor: last?.created_at ?? null };
}
