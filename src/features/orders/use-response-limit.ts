// Hook для daily response limit мастера (P0-5).
//
// Дёргает RPC get_response_limit_today, возвращает {used, max, remaining}
// + helper canRespond. Кэшируется 30 секунд (часто меняется при отклике).
//
// Используется в:
//   - MasterHomeContent — бейдж «3 из 5 откликов» в шапке
//   - OrderResponseForm — disabled state кнопки «Откликнуться» при remaining=0
// Эталон: Яндекс Услуги (7/день в free-tier).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ResponseLimit {
  used: number;
  max: number;
  remaining: number;
}

export const RESPONSE_LIMIT_QUERY_KEY = ["response-limit-today"] as const;

export function useResponseLimit(enabled = true) {
  return useQuery<ResponseLimit>({
    queryKey: RESPONSE_LIMIT_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_response_limit_today");
      if (error) throw error;
      // RPC возвращает jsonb — Supabase JS приводит к unknown, разбираем.
      const json = data as unknown as ResponseLimit | null;
      if (!json) return { used: 0, max: 5, remaining: 5 };
      return {
        used: typeof json.used === "number" ? json.used : 0,
        max: typeof json.max === "number" ? json.max : 5,
        remaining: typeof json.remaining === "number" ? json.remaining : 5,
      };
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Локальный helper для invalidate после успешного отклика — вызывать в onSuccess
 * мутации создания order_response, чтобы бейдж сразу обновился.
 */
export function useInvalidateResponseLimit() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: RESPONSE_LIMIT_QUERY_KEY });
}

/**
 * Текст ошибки от триггера БД (для отображения в форме отклика).
 */
export function isDailyLimitError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as { message?: string }).message ?? String(error);
  return msg.includes("daily_response_limit_reached");
}
