// Hook: лента заявок для мастера. Возвращает orders где:
//   - l2_id ∈ master_categories мастера
//   - status = 'open'
// Sprint 5: без city-фильтра. Sprint 6 добавит match by city + service_radius.

import { useQuery } from "@tanstack/react-query";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export function masterFeedKey(userId: string | undefined, l2Ids: string[]) {
  return ["master-feed", userId, l2Ids.slice().sort().join(",")] as const;
}

interface UseMasterFeedInput {
  userId: string | undefined;
  l2Ids: string[];
}

export function useMasterFeed({ userId, l2Ids }: UseMasterFeedInput) {
  return useQuery<OrderWithRefs[]>({
    queryKey: masterFeedKey(userId, l2Ids),
    queryFn: async () => {
      if (!userId || l2Ids.length === 0) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*, l2:categories_l2(id, name_ru, icon), city:cities(id, name)")
        .eq("status", "open")
        .neq("client_id", userId) // не показываем свои заказы мастеру
        .in("l2_id", l2Ids)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as OrderWithRefs[];
    },
    enabled: !!userId && l2Ids.length > 0,
    staleTime: 30_000,
  });
}

export type FeedOrder = Tables<"orders">;
