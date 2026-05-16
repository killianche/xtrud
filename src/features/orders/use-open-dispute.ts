// useOpenDispute — открыть спор (T10/T12 в docs/lifecycle.md).
// Через RPC open_dispute. Доступно обеим сторонам из in_progress / awaiting_confirmation.
//
// Reason: 10-1000 символов, обязателен. На стороне UI валидируем заранее
// (иначе RPC бросит 22023 dispute_reason_too_short / too_long).
//
// Используется в /orders/[id] — кнопка «Оспорить» с BottomSheet для ввода reason.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { ordersAssignedToMeKey } from "@/features/orders/use-orders-assigned-to-me";
import { supabase } from "@/lib/supabase";

export interface OpenDisputeInput {
  orderId: string;
  reason: string;
  /** User id (client или master) — для инвалидации обоих кэшей. */
  userId: string;
}

export function useOpenDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: OpenDisputeInput): Promise<void> => {
      const trimmed = reason.trim();
      if (trimmed.length < 10) {
        throw new Error("Опишите причину подробнее (минимум 10 символов).");
      }
      if (trimmed.length > 1000) {
        throw new Error("Слишком длинное описание (максимум 1000 символов).");
      }
      const { error } = await supabase.rpc("open_dispute", {
        p_order_id: orderId,
        p_reason: trimmed,
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
