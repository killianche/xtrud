// Hook поиска категорий — главный API для умного поиска (P0-NEW).
//
// Под капотом RPC search_categories(query) возвращает топ-N L2/L3 с score
// и source ('synonym' | 'fts' | 'trigram'). На клиенте делаем 2
// параллельных запроса:
//   1. Исходный
//   2. flipLayout(query) — если внутри только латиница (раскладка-fix)
//
// Если в исходном >0 hits → берём его. Если 0 hits и flipped > 0 →
// показываем flipped + проставляем флаг wasFlipped (UI рисует баннер
// «Возможно, вы искали: <flipped query>»).
//
// Эталон: Google «Showing results for ...» pattern.

import { useQuery } from "@tanstack/react-query";
import {
  type CategoryDataSource,
  searchTaskCatalogWithFallback,
} from "@/features/categories/bundled-task-catalog";
import {
  enforceCategorySearchContract,
  resolvedCategorySearchQuery,
} from "@/features/categories/category-search-contract";
import { supabase } from "@/lib/supabase";

export interface SearchHit {
  kind: "l2" | "l3";
  id: string;
  name_ru: string;
  /** Для L3 — родительская L2 (для перехода в каталог категории). */
  l2_id: string;
  score: number;
  /** Источники матчинга: synonym,fts,trigram. */
  source: string;
}

export interface SearchResult {
  hits: SearchHit[];
  /** True если исходный запрос дал 0 hits и мы показываем результаты flipped. */
  wasFlipped: boolean;
  /** flipLayout(originalQuery) — для UI баннера. */
  flippedQuery: string | null;
}

interface SourcedSearchResult extends SearchResult {
  source: CategoryDataSource;
}

async function rpcSearch(query: string, limit: number): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc("search_categories", {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as unknown as SearchHit[];
}

export function useSearchCategories(query: string, limit = 10) {
  const trimmed = (query ?? "").trim();
  const enabled = trimmed.length >= 2;

  const result = useQuery<SourcedSearchResult>({
    queryKey: ["search-categories", trimmed, limit] as const,
    queryFn: () => searchTaskCatalogWithFallback(trimmed, limit, rpcSearch),
    enabled,
    staleTime: (queryState) => (queryState.state.data?.source === "bundle" ? 0 : 30_000),
    refetchOnReconnect: true,
  });

  return {
    ...result,
    data: result.data
      ? {
          hits: enforceCategorySearchContract(
            resolvedCategorySearchQuery(trimmed, result.data.wasFlipped, result.data.flippedQuery),
            result.data.hits,
          ),
          wasFlipped: result.data.wasFlipped,
          flippedQuery: result.data.flippedQuery,
        }
      : undefined,
    source: result.data?.source ?? null,
  };
}
