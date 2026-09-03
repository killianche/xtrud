// Чистая логика «недавних запросов»: разбор хранилища и слияние новой записи.
//
// Вынесено из `use-recent-searches.ts` отдельным модулем, потому что хук
// тянет `@/lib/storage` → `expo-secure-store` → `react-native`, а vitest не
// разбирает Flow-синтаксис react-native. Так логика остаётся проверяемой
// тестами, а хук отвечает только за хранение и состояние.

/** Больше десяти записей человек всё равно не просматривает. */
export const MAX_RECENT_SEARCHES = 10;
/** Однобуквенные обрывки в истории бесполезны. */
export const MIN_RECENT_SEARCH_LENGTH = 2;
export const RECENT_SEARCHES_KEY = "xtrud.search.recent";

export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length >= MIN_RECENT_SEARCH_LENGTH,
      )
      .map((item) => item.trim())
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

/** Новая запись — первой, дубликаты (без учёта регистра) убираем. */
export function mergeRecentSearch(previous: readonly string[], query: string): string[] {
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (trimmed.length < MIN_RECENT_SEARCH_LENGTH) return [...previous];
  const key = trimmed.toLocaleLowerCase("ru-RU");
  return [trimmed, ...previous.filter((item) => item.toLocaleLowerCase("ru-RU") !== key)].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
}
