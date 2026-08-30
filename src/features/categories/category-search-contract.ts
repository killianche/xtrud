import type { SearchHit } from "@/features/categories/use-search-categories";

function normalizedTokens(value: string): string[] {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^а-яa-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Canonical product decision: CATEGORIES_AND_PROFILES.md (2026-05-27)
 * moved air-conditioner work from `climate` to `appliance-repair`. Production
 * still contains legacy stale exact L2 terms, so the client must not present the
 * obsolete `climate` hit while the forward-only data repair awaits Beget.
 */
export function enforceCategorySearchContract(
  query: string,
  hits: readonly SearchHit[],
): SearchHit[] {
  const isAirConditionerIntent = normalizedTokens(query).some(
    (token) => token.startsWith("кондиционер") || token.startsWith("сплит"),
  );
  if (!isAirConditionerIntent) return [...hits];
  return hits.filter((hit) => hit.l2_id !== "climate");
}

export function resolvedCategorySearchQuery(
  originalQuery: string,
  wasFlipped: boolean,
  flippedQuery: string | null,
): string {
  return wasFlipped && flippedQuery ? flippedQuery : originalQuery;
}
