/**
 * Read-only UX precheck for the provisional active-order limit.
 *
 * It deliberately does not claim to enforce the quota. The same count is
 * repeated immediately before insert, while authoritative race-free
 * enforcement remains a backend migration/rehearsal gate.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getOrderPublishCapacity,
  type OrderPublishCapacity,
} from "@/features/orders/order-publish-capacity";
import { supabase } from "@/lib/supabase";

export function orderPublishCapacityKey(userId: string | undefined) {
  return ["orders", "publish-capacity", userId] as const;
}

export async function fetchActiveOrderCount(clientId: string): Promise<number> {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "open");

  if (error) throw error;
  return count ?? 0;
}

export function useOrderPublishCapacity(userId: string | undefined) {
  return useQuery<OrderPublishCapacity>({
    queryKey: orderPublishCapacityKey(userId),
    queryFn: async () => {
      if (!userId) return getOrderPublishCapacity(0);
      return getOrderPublishCapacity(await fetchActiveOrderCount(userId));
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
