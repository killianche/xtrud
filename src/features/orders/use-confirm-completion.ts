// useConfirmCompletion — клиент подтверждает завершение работы.
// T4 (in_progress → completed) или T5 (awaiting_confirmation → completed)
// в зависимости от текущего статуса. См. docs/lifecycle.md §4.
//
// Через RPC confirm_completion. RPC сам определяет правильный transition.
//
// Используется в /orders/[id] (client view) — кнопка «Подтвердить выполнение»
// когда status IN ('in_progress', 'awaiting_confirmation') и пользователь = client.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";

export interface ConfirmCompletionInput {
  orderId: string;
  /** Client user id — для инвалидации my-orders. */
  userId: string;
}

export function useConfirmCompletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId }: ConfirmCompletionInput): Promise<void> => {
      const { error } = await supabase.rpc("confirm_completion", {
        p_order_id: orderId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: orderDetailKey(vars.orderId) });
      qc.invalidateQueries({ queryKey: myOrdersKey(vars.userId) });
    },
  });
}
