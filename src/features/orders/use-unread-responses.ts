/**
 * Hooks для tab-badge «Заказы» (client side).
 *
 * - useUnreadResponsesCount: COUNT('sent' responses на мои orders).
 * - useMarkResponsesViewed: вызывается при open order detail (isOwner),
 *   переводит все 'sent' → 'viewed' через RPC.
 * - useRealtimeMyResponses: подписка на INSERT order_responses → invalidate count.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { unreadResponsesKey } from "@/features/orders/unread-feed-helpers";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";

export { unreadResponsesKey };

export function useUnreadResponsesCount(userId: string | null | undefined) {
  return useQuery<number>({
    queryKey: unreadResponsesKey(userId ?? undefined),
    queryFn: async () => {
      if (!userId) return 0;
      // 1. Берём id моих orders (status в open/in_progress — completed/cancelled
      //    не приносят новых откликов).
      const { data: myOrders, error: ordersErr } = await supabase
        .from("orders")
        .select("id")
        .eq("client_id", userId)
        .in("status", ["open", "in_progress"]);
      if (ordersErr) throw ordersErr;
      const orderIds = (myOrders ?? []).map((o) => o.id);
      if (orderIds.length === 0) return 0;

      // 2. COUNT(*) responses в status='sent' на этих orders.
      const { count, error } = await supabase
        .from("order_responses")
        .select("id", { count: "exact", head: true })
        .in("order_id", orderIds)
        .eq("status", "sent");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function useMarkResponsesViewed(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc("mark_order_responses_viewed", {
        p_order_id: orderId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: unreadResponsesKey(userId) });
      qc.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      if (userId) qc.invalidateQueries({ queryKey: myOrdersKey(userId) });
    },
  });
}

/**
 * Подписка на INSERT order_responses — invalidate count.
 * Дополнительно ловит UPDATE — на случай accept/reject вне нашего клиента.
 */
export function useRealtimeMyResponses(userId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-responses:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_responses" }, () =>
        qc.invalidateQueries({ queryKey: unreadResponsesKey(userId) }),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "order_responses" }, () =>
        qc.invalidateQueries({ queryKey: unreadResponsesKey(userId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
