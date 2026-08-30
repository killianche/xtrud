/**
 * Dormant search analytics client.
 *
 * Фидбэк user 2026-05-18: «сделай поиск как у людей — изучи Profi/Avito/
 * Yandex/YouDo». Из competitor-аудита: Profi.ru показывает chip cloud с 22+
 * популярными запросами под input — это search shortcuts, генерируемые из
 * реальных поисковых логов + ручной курации.
 *
 * В runnable migrations нет проверенного PII-safe SQL/retention/publication
 * контракта, поэтому UI не импортирует эти hooks. Они остаются изолированным
 * legacy adapter до отдельной versioned backend migration.
 *
 * Adapters:
 *   - useLogSearchQuery — fire-and-forget mutation. Вызывается при сабмите
 *     результата. NB: пишет в БД через `log_search_query` RPC и не должен
 *     подключаться к raw free-text UI до privacy gate.
 *     Не блокирует UI; ошибки остаются в mutation state React Query.
 *   - usePopularQueries(limit) — chip cloud из top_queries_7d (с fallback
 *     на curated synonyms когда логов мало).
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ============================================================================
// Logging
// ============================================================================

export interface LogQueryInput {
  query: string;
  hits: number;
}

export async function logSearchQuery({ query, hits }: LogQueryInput): Promise<void> {
  const { error } = await supabase.rpc("log_search_query", {
    p_query: query,
    p_hits: hits,
  });
  if (error) throw error;
}

/**
 * Fire-and-forget logging через `mutate({ query, hits })` не блокирует UI.
 * Ошибка отклоняет mutationFn, чтобы React Query корректно отметил mutation
 * как failed; сам callback `mutate` остаётся void/non-throwing.
 */
export function useLogSearchQuery() {
  return useMutation<void, Error, LogQueryInput>({
    mutationFn: logSearchQuery,
    // retry false — analytics best-effort, не критично терять одну запись
    retry: false,
  });
}

// ============================================================================
// Popular queries для chip cloud
// ============================================================================

export interface PopularQuery {
  query: string;
  searches: number;
}

const POPULAR_KEY = (limit: number) => ["popular-queries", limit] as const;

export function usePopularQueries(limit = 20) {
  return useQuery<PopularQuery[]>({
    queryKey: POPULAR_KEY(limit),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_popular_queries", {
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as PopularQuery[];
    },
    // Кэш дольше — это статика, обновляется на сервере раз в час по cron
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
