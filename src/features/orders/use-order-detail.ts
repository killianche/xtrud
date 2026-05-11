// Hook загрузки одной заявки + JOIN на L2, city, client (для имени).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export interface OrderDetail extends Tables<"orders"> {
  l2: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon"> | null;
  city: Pick<Tables<"cities">, "id" | "name"> | null;
  client: Pick<Tables<"users">, "id" | "first_name" | "last_name"> | null;
}

export function orderDetailKey(orderId: string | undefined) {
  return ["order-detail", orderId] as const;
}

export function useOrderDetail(orderId: string | undefined) {
  return useQuery<OrderDetail | null>({
    queryKey: orderDetailKey(orderId),
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select(
          "*, l2:categories_l2(id, name_ru, icon), city:cities(id, name), client:users!orders_client_id_fkey(id, first_name, last_name)",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data as OrderDetail | null;
    },
    enabled: !!orderId,
    staleTime: 15_000,
  });
}
