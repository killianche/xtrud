/**
 * Hooks для tab-badge «Заказы» (client side).
 *
 * - useUnreadResponsesCount / useNewResponsesByOrder: 'sent'-отклики на мои
 *   orders — один общий запрос (№278).
 * - useMarkResponsesViewed: вызывается при open order detail (isOwner),
 *   переводит все 'sent' → 'viewed' через RPC.
 * - живые обновления — общая личная подписка use-realtime-notifications.ts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unreadResponsesKey } from "@/features/orders/unread-feed-helpers";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";
import { useStartupSettled } from "@/lib/use-startup-settled";

export { unreadResponsesKey };

/**
 * Новые (непросмотренные) отклики по каждому заданию — один запрос на оба
 * значка: счётчик вкладки и «N новых» на карточке (владелец, 2026-10-03:
 * «красная точка, а непонятно где»). Раньше счётчик и разбивка делали один и
 * тот же запрос дважды (№278: при запуске меньше запросов разом); ждут ~1,5 с
 * после запуска, как остальные значки.
 */
function useNewResponsesQuery<T>(
  userId: string | null | undefined,
  select: (byOrder: Map<string, number>) => T,
) {
  const settled = useStartupSettled();
  return useQuery<Map<string, number>, Error, T>({
    queryKey: [...unreadResponsesKey(userId ?? undefined), "by-order"],
    queryFn: async () => {
      const result = new Map<string, number>();
      if (!userId) return result;
      // Мои задания, которые ещё могут получать отклики.
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
    select,
    enabled: !!userId && settled,
    staleTime: 15_000,
    // Бейдж обновляется при возврате в приложение (focusManager в _layout).
    refetchOnWindowFocus: true,
  });
}

const sumAll = (m: Map<string, number>) => {
  let total = 0;
  for (const n of m.values()) total += n;
  return total;
};
const identity = (m: Map<string, number>) => m;

export function useUnreadResponsesCount(userId: string | null | undefined) {
  return useNewResponsesQuery(userId, sumAll);
}

export function useNewResponsesByOrder(userId: string | null | undefined) {
  return useNewResponsesQuery(userId, identity);
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
