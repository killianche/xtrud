import taskCatalogJson from "@/generated/task-catalog.json";
import { flipLayout, looksLikeWrongLayout } from "@/lib/keyboard-layout";
import { isNetworkTransportError } from "@/lib/network-transport-error";
import { filterL2BySections } from "@/lib/product-scope";

export type CategoryDataSource = "backend" | "bundle";

export interface BundledSection {
  id: string;
  name_ru: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface BundledVisibleCategory {
  id: string;
  l1_id: string;
  name_ru: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  is_visible: boolean;
  is_featured: boolean;
}

interface BundledService {
  id: string;
  l2_id: string;
  name_ru: string;
  sort_order: number;
  is_active: boolean;
}

interface BundledTerm {
  term: string;
  l2_id: string | null;
  l3_id: string | null;
  weight: number;
}

interface BundledTaskCatalog {
  schema_version: 2;
  content_sha256: string;
  /** Разделы каталога (L1) — крупные группы на главной. */
  sections: BundledSection[];
  categories: BundledVisibleCategory[];
  services: BundledService[];
  terms: BundledTerm[];
}

export interface BundledSearchHit {
  kind: "l2" | "l3";
  id: string;
  name_ru: string;
  l2_id: string;
  score: number;
  source: string;
}

export interface SourcedSearchResult {
  hits: BundledSearchHit[];
  wasFlipped: boolean;
  flippedQuery: string | null;
  source: CategoryDataSource;
}

export interface SourcedVisibleCategories {
  items: BundledVisibleCategory[];
  source: CategoryDataSource;
}

const taskCatalog = taskCatalogJson as BundledTaskCatalog;

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^а-яa-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function prefixMatches(candidate: string, query: string): boolean {
  if (!candidate || !query) return false;
  const candidateTokens = candidate.split(" ");
  const queryTokens = query.split(" ");
  const sharedLength = Math.min(candidateTokens.length, queryTokens.length);
  return Array.from({ length: sharedLength }, (_, index) => index).every((index) => {
    const candidateToken = candidateTokens[index];
    const queryToken = queryTokens[index];
    if (!candidateToken || !queryToken) return false;
    if (index < sharedLength - 1) return candidateToken === queryToken;
    return candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken);
  });
}

function containsWholeTerm(candidate: string, query: string): boolean {
  const candidateTokens = candidate.split(" ").filter(Boolean);
  const queryTokens = query.split(" ").filter(Boolean);
  if (candidateTokens.length === 0 || candidateTokens.length >= queryTokens.length) return false;
  return queryTokens.some((_, startIndex) =>
    candidateTokens.every((token, offset) => queryTokens[startIndex + offset] === token),
  );
}

export function getBundledSections(): BundledSection[] {
  return taskCatalog.sections.filter((section) => section.is_active);
}

export function getBundledVisibleCategories(): BundledVisibleCategory[] {
  return filterL2BySections(
    taskCatalog.categories.filter((category) => category.is_active && category.is_visible),
    taskCatalog.sections,
  );
}

export function searchBundledTaskCatalog(query: string, limit: number): BundledSearchHit[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2 || limit <= 0) return [];

  const categories = getBundledVisibleCategories();
  const allowedCategoryIds = new Set(categories.map((category) => category.id));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const services = taskCatalog.services.filter(
    (service) => service.is_active && allowedCategoryIds.has(service.l2_id),
  );
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const hits = new Map<string, BundledSearchHit>();

  const addHit = (hit: BundledSearchHit) => {
    const key = `${hit.kind}:${hit.id}`;
    const previous = hits.get(key);
    if (!previous || hit.score > previous.score) hits.set(key, hit);
  };

  for (const term of taskCatalog.terms) {
    const normalizedTerm = normalizeSearchText(term.term);
    const exact = normalizedTerm === normalizedQuery;
    const prefix = !exact && prefixMatches(normalizedTerm, normalizedQuery);
    const contained = !exact && !prefix && containsWholeTerm(normalizedTerm, normalizedQuery);
    if (!exact && !prefix && !contained) continue;
    const score = exact
      ? 0.6 + (term.weight / 100) * 0.4
      : prefix
        ? 0.6 + (term.weight / 100) * 0.3
        : 0.3 + (term.weight / 100) * 0.2;

    if (term.l2_id) {
      const category = categoryById.get(term.l2_id);
      if (!category) continue;
      addHit({
        kind: "l2",
        id: category.id,
        name_ru: category.name_ru,
        l2_id: category.id,
        score,
        source: "synonym",
      });
      continue;
    }

    if (term.l3_id) {
      const service = serviceById.get(term.l3_id);
      if (!service) continue;
      addHit({
        kind: "l3",
        id: service.id,
        name_ru: service.name_ru,
        l2_id: service.l2_id,
        score,
        source: "synonym",
      });
    }
  }

  for (const category of categories) {
    const normalizedName = normalizeSearchText(category.name_ru);
    const exact = normalizedName === normalizedQuery;
    if (!exact && !prefixMatches(normalizedName, normalizedQuery)) continue;
    addHit({
      kind: "l2",
      id: category.id,
      name_ru: category.name_ru,
      l2_id: category.id,
      score: exact ? 0.59 : 0.45,
      source: "fts",
    });
  }

  for (const service of services) {
    const normalizedName = normalizeSearchText(service.name_ru);
    const exact = normalizedName === normalizedQuery;
    if (!exact && !prefixMatches(normalizedName, normalizedQuery)) continue;
    addHit({
      kind: "l3",
      id: service.id,
      name_ru: service.name_ru,
      l2_id: service.l2_id,
      score: exact ? 0.59 : 0.45,
      source: "fts",
    });
  }

  return [...hits.values()]
    .sort((left, right) => right.score - left.score || left.name_ru.localeCompare(right.name_ru))
    .slice(0, limit);
}

export async function searchTaskCatalogWithFallback(
  query: string,
  limit: number,
  backendSearch: (query: string, limit: number) => Promise<BundledSearchHit[]>,
): Promise<SourcedSearchResult> {
  const flipped = looksLikeWrongLayout(query) ? flipLayout(query) : null;
  const flippedNeedsSearch = Boolean(flipped && flipped !== query);
  const [originalResult, flippedResult] = await Promise.allSettled([
    backendSearch(query, limit),
    flippedNeedsSearch ? backendSearch(flipped as string, limit) : Promise.resolve([]),
  ]);

  // Auth/RLS/API/contract failures must never be hidden by either a successful
  // sibling request or a transport fallback from the other layout.
  for (const result of [originalResult, flippedResult]) {
    if (result.status === "rejected" && !isNetworkTransportError(result.reason)) {
      throw result.reason;
    }
  }

  const originalSource: CategoryDataSource =
    originalResult.status === "fulfilled" ? "backend" : "bundle";
  const flippedSource: CategoryDataSource =
    flippedResult.status === "fulfilled" ? "backend" : "bundle";
  const originalHits =
    originalResult.status === "fulfilled"
      ? originalResult.value
      : searchBundledTaskCatalog(query, limit);
  const flippedHits =
    flippedResult.status === "fulfilled"
      ? flippedResult.value
      : flipped
        ? searchBundledTaskCatalog(flipped, limit)
        : [];

  if (originalHits.length > 0) {
    return {
      hits: originalHits,
      wasFlipped: false,
      flippedQuery: null,
      source: originalSource,
    };
  }
  if (flippedHits.length > 0 && flipped) {
    return {
      hits: flippedHits,
      wasFlipped: true,
      flippedQuery: flipped,
      source: flippedSource,
    };
  }
  const source =
    originalSource === "backend" && (!flippedNeedsSearch || flippedSource === "backend")
      ? "backend"
      : "bundle";
  return { hits: [], wasFlipped: false, flippedQuery: null, source };
}

export async function loadVisibleTaskCatalogWithFallback(
  backendLoad: () => Promise<BundledVisibleCategory[]>,
): Promise<SourcedVisibleCategories> {
  try {
    return { items: await backendLoad(), source: "backend" };
  } catch (error) {
    if (!isNetworkTransportError(error)) throw error;
    return { items: getBundledVisibleCategories(), source: "bundle" };
  }
}
