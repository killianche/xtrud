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
  UNLIMITED,
} from "@/features/orders/order-publish-capacity";
import { supabase } from "@/lib/supabase";

export function orderPublishCapacityKey(userId: string | undefined) {
  return ["orders", "publish-capacity", userId] as const;
}

export async function fetchActiveOrderCount(clientId: string): Promise<number> {
  // Те же статусы, что считает база (guard_order_publication_limit).
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("status", ["open", "in_progress", "awaiting_confirmation"]);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Лимит активных заданий из настроек админки (0203): 0 — без ограничения.
 * Не прочитали — не блокируем: решающая проверка всё равно в базе.
 */
export async function fetchActiveOrderLimit(): Promise<number> {
  const { data, error } = await supabase.rpc("get_order_limits");
  if (error || !data) return UNLIMITED;
  const active = (data as { active?: unknown }).active;
  return typeof active === "number" && active >= 0 ? active : UNLIMITED;
}

export async function fetchOrderPublishCapacity(clientId: string): Promise<OrderPublishCapacity> {
  const [count, limit] = await Promise.all([
    fetchActiveOrderCount(clientId),
    fetchActiveOrderLimit(),
  ]);
  return getOrderPublishCapacity(count, limit);
}

export function useOrderPublishCapacity(userId: string | undefined) {
  return useQuery<OrderPublishCapacity>({
    queryKey: orderPublishCapacityKey(userId),
    queryFn: async () => {
      if (!userId) return getOrderPublishCapacity(0, UNLIMITED);
      return fetchOrderPublishCapacity(userId);
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
