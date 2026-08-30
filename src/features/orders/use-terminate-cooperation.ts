// useTerminateCooperation — обе стороны (клиент / picked_master) прекращают
// сотрудничество, когда работа НЕ выполнена.
//
// Через RPC terminate_cooperation. Order in_progress / awaiting_confirmation →
// cancelled c reason='cooperation_ended_by_<role>'. Push другой стороне.
// Reopen возможен в 7-дневном окне (T9 RPC reopen_order).
//
// Единственный путь «не дошло до конца» (по фидбэку user 2026-05-16).
// Функционал «Оспорить» (RPC open_dispute) полностью удалён 2026-05-28 —
// в доске объявлений спор не нужен, стороны решают вопросы сами/по закону РФ
// (см. текст пользовательского соглашения). Неиспользуемое значение статуса
// `disputed` осталось в БД как безвредный остаток (0 записей).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { ordersAssignedToMeKey } from "@/features/orders/use-orders-assigned-to-me";
import { supabase } from "@/lib/supabase";

export interface TerminateCooperationInput {
  orderId: string;
  /** Optional reason — до 500 символов. Если пусто, RPC проставит
   *  `cooperation_ended_by_<role>` автоматически. */
  reason?: string | null;
  /** User id (client или master) — для инвалидации обоих кэшей. */
  userId: string;
}

export function useTerminateCooperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: TerminateCooperationInput): Promise<void> => {
      const trimmed = reason?.trim() ?? null;
      if (trimmed && trimmed.length > 500) {
        throw new Error("Слишком длинный текст (максимум 500 символов).");
      }
      const { error } = await supabase.rpc("terminate_cooperation", {
        p_order_id: orderId,
        ...(trimmed ? { p_reason: trimmed } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: orderDetailKey(vars.orderId) });
      qc.invalidateQueries({ queryKey: myOrdersKey(vars.userId) });
      qc.invalidateQueries({ queryKey: ordersAssignedToMeKey(vars.userId) });
    },
  });
}
