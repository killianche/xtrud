// Hook загрузки заказов текущего пользователя-клиента.
// JOIN на categories_l2 (для name_ru/icon) и cities (для name города).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Order = Tables<"orders">;

export interface OrderWithRefs extends Order {
  l2: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon"> | null;
  city: Pick<Tables<"cities">, "id" | "name"> | null;
}

export function myOrdersKey(userId: string | undefined) {
  return ["my-orders", userId] as const;
}

export function useMyOrders(userId: string | undefined) {
  return useQuery<OrderWithRefs[]>({
    queryKey: myOrdersKey(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*, l2:categories_l2(id, name_ru, icon), city:cities(id, name)")
        .eq("client_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderWithRefs[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
