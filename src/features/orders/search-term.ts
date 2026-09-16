/**
 * Поиск заданий по тексту (экран «Найти задание», 2026-09-16).
 */

/** Текст поиска для фильтра PostgREST: без символов его синтаксиса. */
export function searchTerm(query: string | null | undefined): string | null {
  const cleaned = (query ?? "")
    .replace(/[,()*"\\:%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 60) : null;
}
