/**
 * Hooks для tab-badge «Заказы» (client side).
 *
 * - useUnreadResponsesCount: COUNT('sent' responses на мои orders).
 * - useMarkResponsesViewed: вызывается при open order detail (isOwner),
 *   переводит все 'sent' → 'viewed' через RPC.
 * - живые обновления — общая личная подписка use-realtime-notifications.ts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    // Бейдж обновляется при возврате в приложение (focusManager в _layout).
    refetchOnWindowFocus: true,
  });
}

/**
 * Новые (непросмотренные) отклики по каждому заданию — чтобы бейдж «Мои
 * задания» было где увидеть: карточка показывает «N новых» (владелец,
 * 2026-10-03: «красная точка, а непонятно где»). Тот же запрос, что у
 * счётчика, и ключ под ним — обновляются и гаснут вместе.
 */
export function useNewResponsesByOrder(userId: string | null | undefined) {
  return useQuery<Map<string, number>>({
    queryKey: [...unreadResponsesKey(userId ?? undefined), "by-order"],
    queryFn: async () => {
      const result = new Map<string, number>();
      if (!userId) return result;
      const { data: myOrders, error: ordersErr } = await supabase
        .from("orders")
        .select("id")
        .eq("client_id", userId)
        .in("status", ["open", "in_progress"]);
      if (ordersErr) throw ordersErr;
      const orderIds = (myOrders ?? []).map((o) => o.id);
      if (orderIds.length === 0) return result;
      const { data, error } = await supabase
        .from("order_responses")
        .select("order_id")
        .in("order_id", orderIds)
        .eq("status", "sent");
      if (error) throw error;
      for (const row of data ?? []) {
        result.set(row.order_id, (result.get(row.order_id) ?? 0) + 1);
      }
      return result;
    },
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
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
