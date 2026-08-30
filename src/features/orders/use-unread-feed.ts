/**
 * Hooks для master-side tab-badge «Заказы» — счётчик новых заявок в feed.
 *
 * Sprint 13.1:
 *  - useUnreadFeedCount(userId, l2Ids, lastSeenAt): COUNT orders WHERE
 *    status='open' AND l2_id IN l2Ids AND client_id != userId AND
 *    created_at > lastSeenAt.
 *  - useMarkFeedSeen: RPC mark_feed_seen() — каждый mount /orders tab.
 *  - useRealtimeFeed: подписка на INSERT orders → invalidate count.
 *
 * Не вычитаем уже-откликнутые orders: minor over-count приемлем,
 * избегает сложного NOT IN запроса.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { userRecordKey } from "@/features/auth/use-user-record";
import {
  type OrderRowMinimal,
  shouldInvalidateFeedOnInsert,
  unreadFeedKey,
} from "@/features/orders/unread-feed-helpers";
import { supabase } from "@/lib/supabase";

export { unreadFeedKey };

export function useUnreadFeedCount(opts: {
  userId: string | null | undefined;
  l2Ids: string[];
  lastSeenAt: string | null;
}) {
  return useQuery<number>({
    queryKey: unreadFeedKey(opts.userId ?? undefined, opts.l2Ids),
    queryFn: async () => {
      if (!opts.userId || opts.l2Ids.length === 0) return 0;
      let q = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .neq("client_id", opts.userId)
        .in("l2_id", opts.l2Ids);
      if (opts.lastSeenAt) {
        q = q.gt("created_at", opts.lastSeenAt);
      }
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!opts.userId && opts.l2Ids.length > 0,
    staleTime: 15_000,
  });
}

export function useMarkFeedSeen(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_feed_seen");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}

export function useRealtimeFeed(opts: { userId: string | null | undefined; l2Ids: string[] }) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!opts.userId || opts.l2Ids.length === 0) return;
    const channel = supabase
      .channel(`feed:${opts.userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as OrderRowMinimal;
        if (opts.userId && shouldInvalidateFeedOnInsert(row, opts.userId, opts.l2Ids)) {
          qc.invalidateQueries({
            queryKey: unreadFeedKey(opts.userId ?? undefined, opts.l2Ids),
          });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [opts.userId, opts.l2Ids, qc]);
}
