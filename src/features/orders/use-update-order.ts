// Mutation: владелец редактирует заказ.
// RLS orders_update_own разрешает UPDATE только при auth.uid()=client_id.
// На уровне БД status не ограничен — но в UI экран edit показываем только при
// status='open' (после принятия отклика заказ заморожен по бизнес-логике).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export interface UpdateOrderInput {
  orderId: string;
  clientId: string;
  l2Id: string;
  title: string;
  description: string;
  cityId: string;
  district: string;
  urgency: Database["public"]["Enums"]["order_urgency"];
  budgetMode: Database["public"]["Enums"]["order_budget_mode"];
  budgetMin: number | null;
  budgetMax: number | null;
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      const payload: Database["public"]["Tables"]["orders"]["Update"] = {
        l2_id: input.l2Id,
        title: input.title,
        description: input.description,
        city_id: input.cityId,
        district: input.district || null,
        urgency: input.urgency,
        budget_mode: input.budgetMode,
        budget_min: input.budgetMin,
        budget_max: input.budgetMax,
      };
      const { error } = await supabase.from("orders").update(payload).eq("id", input.orderId);
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, clientId }) => {
      queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myOrdersKey(clientId) });
    },
  });
}
