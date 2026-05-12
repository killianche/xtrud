// Hook: заявки, где меня выбрали мастером (picked_master_id = userId).

import { useQuery } from "@tanstack/react-query";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { supabase } from "@/lib/supabase";

export function ordersAssignedToMeKey(userId: string | undefined) {
  return ["orders-assigned-to-me", userId] as const;
}

export function useOrdersAssignedToMe(userId: string | undefined) {
  return useQuery<OrderWithRefs[]>({
    queryKey: ordersAssignedToMeKey(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*, l2:categories_l2(id, name_ru, icon), city:cities(id, name)")
        .eq("picked_master_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderWithRefs[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
