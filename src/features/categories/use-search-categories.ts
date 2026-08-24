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
import { flipLayout, looksLikeWrongLayout } from "@/lib/keyboard-layout";
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

  return useQuery<SearchResult>({
    queryKey: ["search-categories", trimmed, limit] as const,
    queryFn: async () => {
      // 1. Исходный запрос всегда.
      // 2. Раскладка-fix параллельно — только если строка похожа на
      //    «латиница в русской раскладке» (looksLikeWrongLayout).
      const flipped = looksLikeWrongLayout(trimmed) ? flipLayout(trimmed) : null;
      const originalPromise = rpcSearch(trimmed, limit);
      const flippedPromise: Promise<SearchHit[]> =
        flipped && flipped !== trimmed ? rpcSearch(flipped, limit) : Promise.resolve([]);

      const [originalHits, flippedHits] = await Promise.all([originalPromise, flippedPromise]);

      if (originalHits.length > 0) {
        return { hits: originalHits, wasFlipped: false, flippedQuery: null };
      }
      if (flippedHits.length > 0 && flipped) {
        return { hits: flippedHits, wasFlipped: true, flippedQuery: flipped };
      }
      return { hits: [], wasFlipped: false, flippedQuery: null };
    },
    enabled,
    staleTime: 30_000,
  });
}
