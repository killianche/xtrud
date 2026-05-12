// Mutation: пометить заказ как completed.
// RLS позволяет UPDATE: client_id=me (orders_update_own) ИЛИ
// picked_master_id=me + status='in_progress'→'completed' (orders_picked_master_can_complete).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { ordersAssignedToMeKey } from "@/features/orders/use-orders-assigned-to-me";
import { supabase } from "@/lib/supabase";

export interface CompleteOrderInput {
  orderId: string;
  userId: string;
}

export function useCompleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId }: CompleteOrderInput) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "completed" })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, userId }) => {
      queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myOrdersKey(userId) });
      queryClient.invalidateQueries({ queryKey: ordersAssignedToMeKey(userId) });
    },
  });
}
