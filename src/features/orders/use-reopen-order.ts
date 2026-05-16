// useReopenOrder — клиент возобновляет cancelled/expired заказ (T9 в docs/lifecycle.md).
// Через RPC reopen_order. Окно 7 дней с момента updated_at.
//
// Сбрасывает picked_master_id и expires_at (+14 дней). Push'ит мастерам, чьи
// отклики были withdrawn в T2/T7 side-effect — приглашает откликнуться заново.
//
// Используется в /orders/[id] (client view) — кнопка «Возобновить заказ»
// когда status IN ('cancelled', 'expired') и client_id = current user
// и (now - updated_at) < 7 days.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";

export interface ReopenOrderInput {
  orderId: string;
  /** Client user id — для инвалидации my-orders. */
  userId: string;
}

export function useReopenOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId }: ReopenOrderInput): Promise<void> => {
      const { error } = await supabase.rpc("reopen_order", {
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

/** Helper: можно ли reopen заказ? Окно 7 дней с момента updated_at. */
export function canReopenOrder(
  status: string,
  updatedAt: string | null | undefined,
): boolean {
  if (status !== "cancelled" && status !== "expired") return false;
  if (!updatedAt) return false;
  const updatedMs = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return false;
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - updatedMs < windowMs;
}
