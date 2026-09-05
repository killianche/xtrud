// useWithdrawResponse — мастер отзывает свой отклик (T15 в docs/lifecycle.md).
// Через RPC withdraw_response. Только из sent/viewed (до accept).
// Используется в /orders/[id] (master view) — кнопка «Отозвать отклик»
// рядом с собственным откликом.
//
// Сторонние эффекты: push клиенту «мастер отозвал», status → withdrawn.
//
// ИСПРАВЛЕНО 2026-09-05 (FACT, по скриншоту владельца). Человек отзывал отклик,
// на экране оставалось «Отклик отправлен» с кнопкой «Отозвать», он жал ещё раз
// и получал техническую строку cannot_withdraw_after_decision.
//
// В базе при этом всё прошло: order_responses.status = withdrawn, updated_at
// совпадает с минутой на скриншоте. То есть отзыв СРАБОТАЛ, а экран об этом не
// узнал: карточка отклика читается запросом с ключом
// ["my-response", orderId, userId] (useMyResponseForOrder), а сбрасывались
// три других ключа — ленты и списка «Мои отклики». Нужного среди них не было.
// Второе нажатие уходило на сервер уже по отозванному отклику, и сервер
// справедливо отказывал.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myResponsesKey } from "@/features/orders/use-my-responses";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { myResponseKey, orderResponsesKey } from "@/features/orders/use-order-responses";
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
      // Карточка «Ваш отклик» на экране задания. Без этой строки экран
      // оставался в старом состоянии, и человек жал «Отозвать» второй раз.
      qc.invalidateQueries({ queryKey: myResponseKey(vars.orderId, vars.masterId) });
      qc.invalidateQueries({ queryKey: orderResponsesKey(vars.orderId) });
      qc.invalidateQueries({ queryKey: orderDetailKey(vars.orderId) });
      qc.invalidateQueries({ queryKey: myResponsesKey(vars.masterId) });
      // Отозванный отклик возвращает слот дневного лимита (5/день) — обновляем
      // счётчик, чтобы освободившийся слот сразу был виден мастеру.
      qc.invalidateQueries({ queryKey: RESPONSE_LIMIT_QUERY_KEY });
    },
  });
}
