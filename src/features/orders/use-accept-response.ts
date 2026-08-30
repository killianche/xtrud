// Mutation: клиент принимает отклик мастера.
// Атомарно через RPC accept_response — response→accepted, остальные→rejected,
// order→in_progress + picked_master_id.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { orderResponsesKey } from "@/features/orders/use-order-responses";
import { supabase } from "@/lib/supabase";

export interface AcceptResponseInput {
  responseId: string;
  orderId: string;
  clientId: string;
}

export function useAcceptResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ responseId }: AcceptResponseInput) => {
      const { error } = await supabase.rpc("accept_response", {
        p_response_id: responseId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, clientId }) => {
      queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      queryClient.invalidateQueries({ queryKey: orderResponsesKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myOrdersKey(clientId) });
    },
  });
}
