/**
 * Converts deterministic category-search hits into user-confirmable task
 * suggestions. A suggestion is never auto-selected; tapping it is the act that
 * confirms both the public title and the allowed L2 category.
 */

import type { SearchHit } from "@/features/categories/use-search-categories";

export interface IntentCategory {
  id: string;
  name_ru: string;
}

export interface TaskIntentSuggestion {
  key: string;
  title: string;
  l2Id: string;
  categoryName: string;
  matchedServiceName: string;
}

export interface TaskIntentCategoryCandidate {
  key: string;
  l2Id: string;
  categoryName: string;
  matchedServiceName: string;
}

export function resolveTaskIntentQuery(
  query: string,
  wasFlipped: boolean,
  flippedQuery: string | null,
): string {
  return wasFlipped && flippedQuery ? flippedQuery : query;
}

export function changedTaskIntentDraft(value: string): { title: string; l2Id: "" } {
  return {
    title: value.replace(/\s+/g, " ").trim().slice(0, 120),
    l2Id: "",
  };
}

function normalizeTaskTitle(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return `${normalized.charAt(0).toLocaleUpperCase("ru-RU")}${normalized.slice(1)}`;
}

function isHighConfidenceServiceVariant(hit: SearchHit): boolean {
  return hit.kind === "l3" && hasSource(hit, "synonym") && hit.score === 1;
}

function hasSource(hit: SearchHit, source: string): boolean {
  return hit.source.split(",").includes(source);
}

function confidentCategoryId(
  hits: readonly SearchHit[],
  allowedCategoryIds: ReadonlySet<string>,
): string | null {
  // Migration 0084 and the bundled-catalog contract both reserve score=1 for
  // an exact, weight-100 thesaurus match. Anything below that is fuzzy,
  // prefix-based or deliberately lower-weight and therefore must ask the user.
  const exactCategoryIds = new Set(
    hits
      .filter(
        (hit) => allowedCategoryIds.has(hit.l2_id) && hasSource(hit, "synonym") && hit.score === 1,
      )
      .map((hit) => hit.l2_id),
  );
  return exactCategoryIds.size === 1 ? ([...exactCategoryIds][0] ?? null) : null;
}

export function buildTaskIntentSuggestions(
  query: string,
  hits: readonly SearchHit[],
  categories: readonly IntentCategory[],
  limit = 5,
): TaskIntentSuggestion[] {
  const requestedTitle = normalizeTaskTitle(query);
  if (!requestedTitle || limit <= 0) return [];

  const allowedCategoryNames = new Map(
    categories.map((category) => [category.id, category.name_ru]),
  );
  const allowedHits = hits.filter((hit) => allowedCategoryNames.has(hit.l2_id));
  const confidentL2Id = confidentCategoryId(hits, new Set(allowedCategoryNames.keys()));
  if (!confidentL2Id) return [];
  const suggestions: TaskIntentSuggestion[] = [];
  const seen = new Set<string>();

  const push = (title: string, hit: SearchHit) => {
    const categoryName = allowedCategoryNames.get(hit.l2_id);
    if (!categoryName) return;
    const normalizedTitle = normalizeTaskTitle(title);
    const dedupeKey = `${normalizedTitle.toLocaleLowerCase("ru-RU")}:${hit.l2_id}`;
    if (!normalizedTitle || seen.has(dedupeKey) || suggestions.length >= limit) return;
    seen.add(dedupeKey);
    suggestions.push({
      key: `${hit.kind}:${hit.id}:${dedupeKey}`,
      title: normalizedTitle,
      l2Id: hit.l2_id,
      categoryName,
      matchedServiceName: hit.name_ru,
    });
  };

  const firstHit = allowedHits.find(
    (hit) => hit.l2_id === confidentL2Id && hasSource(hit, "synonym") && hit.score === 1,
  );
  if (firstHit) push(requestedTitle, firstHit);

  for (const hit of allowedHits) {
    if (hit.l2_id === confidentL2Id && isHighConfidenceServiceVariant(hit)) {
      push(hit.name_ru, hit);
    }
  }

  return suggestions;
}

/**
 * Low-confidence fallback. It exposes only the best unique L2 candidates and
 * requires an explicit tap; scores never leak into the UI and no category is
 * silently assigned.
 */
export function buildTaskIntentCategoryCandidates(
  hits: readonly SearchHit[],
  categories: readonly IntentCategory[],
  limit = 8,
): TaskIntentCategoryCandidate[] {
  if (limit <= 0) return [];
  const allowedCategoryNames = new Map(
    categories.map((category) => [category.id, category.name_ru]),
  );

  const isTrigramOnly = (hit: SearchHit) =>
    hit.source.split(",").every((source) => source === "trigram");

  // Смысловые совпадения идут первыми. Совпадения только по триграммам —
  // кандидаты «на опечатку»: они слабее, поэтому показываются лишь тогда,
  // когда ничего лучше нет.
  //
  // Раньше они отбрасывались совсем, и при опечатке экран говорил «точной
  // подсказки не нашли», хотя подходящая категория была найдена. Именно это
  // владелец описал как «поиск не показывает нормальные результаты»
  // (DECISION 2026-09-03). Категория по-прежнему не назначается сама:
  // требуется явный тап, а в строке видно, на что похоже совпадение.
  const collect = (source: readonly SearchHit[], into: TaskIntentCategoryCandidate[]) => {
    const seen = new Set(into.map((candidate) => candidate.l2Id));
    for (const hit of source) {
      const categoryName = allowedCategoryNames.get(hit.l2_id);
      if (!categoryName || seen.has(hit.l2_id)) continue;
      seen.add(hit.l2_id);
      into.push({
        key: `category:${hit.l2_id}`,
        l2Id: hit.l2_id,
        categoryName,
        matchedServiceName: hit.name_ru,
      });
      if (into.length >= limit) break;
    }
  };

  const candidates: TaskIntentCategoryCandidate[] = [];
  collect(
    hits.filter((hit) => !isTrigramOnly(hit)),
    candidates,
  );
  if (candidates.length === 0) {
    collect(hits.filter(isTrigramOnly), candidates);
  }

  return candidates;
}
