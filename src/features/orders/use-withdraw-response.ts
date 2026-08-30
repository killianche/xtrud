// useWithdrawResponse — мастер отзывает свой отклик (T15 в docs/lifecycle.md).
// Через RPC withdraw_response. Только из sent/viewed (до accept).
// Используется в /orders/[id] (master view) — кнопка «Отозвать отклик»
// рядом с собственным откликом.
//
// Сторонние эффекты: push клиенту «мастер отозвал», status → withdrawn.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myResponsesKey } from "@/features/orders/use-my-responses";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { RESPONSE_LIMIT_QUERY_KEY } from "@/features/orders/use-response-limit";
import { supabase } from "@/lib/supabase";

export interface WithdrawResponseInput {
  responseId: string;
  /** Order id — для инвалидации order-responses + my-responses кэша. */
  orderId: string;
  /** Master user id — для инвалидации my-responses кэша. */
  masterId: string;
}

export function useWithdrawResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ responseId }: WithdrawResponseInput): Promise<void> => {
      const { error } = await supabase.rpc("withdraw_response", {
        p_response_id: responseId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["order-responses", vars.orderId] });
      qc.invalidateQueries({ queryKey: orderDetailKey(vars.orderId) });
      qc.invalidateQueries({ queryKey: myResponsesKey(vars.masterId) });
      // Отозванный отклик возвращает слот дневного лимита (5/день) — обновляем
      // счётчик, чтобы освободившийся слот сразу был виден мастеру.
      qc.invalidateQueries({ queryKey: RESPONSE_LIMIT_QUERY_KEY });
    },
  });
}
