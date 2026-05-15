// Mutation: создать заказ клиентом.
// RLS orders_insert_own проверит auth.uid() = client_id.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ALL_INGUSHETIA_CITY } from "@/features/orders/order-schema";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { supabase } from "@/lib/supabase";
import type { Database, Enums } from "@/types/database";

export type OrderUrgency = Enums<"order_urgency">;
export type OrderBudgetMode = Enums<"order_budget_mode">;

export interface CreateOrderInput {
  clientId: string;
  l2Id: string;
  title: string;
  description: string;
  cityId: string;
  district: string;
  urgency: OrderUrgency;
  budgetMode: OrderBudgetMode;
  budgetMin: number | null;
  budgetMax: number | null;
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<{ id: string }> => {
      const payload: Database["public"]["Tables"]["orders"]["Insert"] = {
        client_id: input.clientId,
        l2_id: input.l2Id,
        title: input.title,
        description: input.description,
        // «Вся Ингушетия» = NULL (миграция 0045 сделала city_id nullable).
        city_id: input.cityId === ALL_INGUSHETIA_CITY ? null : input.cityId,
        district: input.district || null,
        urgency: input.urgency,
        budget_mode: input.budgetMode,
        budget_min: input.budgetMin,
        budget_max: input.budgetMax,
        status: "open",
      };
      const { data, error } = await supabase.from("orders").insert(payload).select("id").single();
      if (error) throw error;
      return { id: data.id };
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: myOrdersKey(clientId) });
    },
  });
}
