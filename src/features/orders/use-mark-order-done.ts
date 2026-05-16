// useMarkOrderDone — picked master помечает «работа выполнена» (T8 в docs/lifecycle.md).
// Через RPC mark_order_done. in_progress → awaiting_confirmation.
// Клиенту приходит push, у него 72h на подтвердить / оспорить, иначе cron T11
// закроет автоматом.
//
// Используется в /orders/[id] (master view) — кнопка «Работа выполнена»
// когда status='in_progress' и picked_master_id = current user.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { ordersAssignedToMeKey } from "@/features/orders/use-orders-assigned-to-me";
import { supabase } from "@/lib/supabase";

export interface MarkOrderDoneInput {
  orderId: string;
  /** Master user id — для инвалидации assigned/my-orders. */
  userId: string;
}

export function useMarkOrderDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId }: MarkOrderDoneInput): Promise<void> => {
      const { error } = await supabase.rpc("mark_order_done", {
        p_order_id: orderId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: orderDetailKey(vars.orderId) });
      qc.invalidateQueries({ queryKey: ordersAssignedToMeKey(vars.userId) });
      qc.invalidateQueries({ queryKey: myOrdersKey(vars.userId) });
    },
  });
}
