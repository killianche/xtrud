/**
 * Hooks для master-side tab-badge «Заказы» — счётчик новых заявок в feed.
 *
 * Sprint 13.1:
 *  - useUnreadFeedCount(userId, l2Ids, lastSeenAt): COUNT orders WHERE
 *    status='open' AND l2_id IN l2Ids AND client_id != userId AND
 *    created_at > lastSeenAt.
 *  - useMarkFeedSeen: RPC mark_feed_seen() — при каждом заходе на вкладку
 *    «Найти задание» и пока она открыта (app/(tabs)/_layout.tsx, №243).
 *  - живые обновления — общая личная подписка use-realtime-notifications.ts.
 *
 * Уже откликнутые задания вычитаются на клиенте (№243: «1» висела на
 * задании, на которое владелец уже откликнулся, и найти его было нельзя).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { userRecordKey } from "@/features/auth/use-user-record";
import { unreadFeedKey } from "@/features/orders/unread-feed-helpers";
import { supabase } from "@/lib/supabase";
import { orderCategoryFilter } from "./order-categories";

export { unreadFeedKey };

export function useUnreadFeedCount(opts: {
  userId: string | null | undefined;
  l2Ids: string[];
  lastSeenAt: string | null;
  /** Задания, на которые я уже откликнулся, — для меня не «новые» (№243). */
  respondedIds?: ReadonlySet<string>;
}): { data: number } {
  const query = useQuery<string[]>({
    // lastSeenAt в ключе: после «посмотрел ленту» счёт сразу пересчитывается
    // по новой отметке, а не ждёт устаревания (№243 — значок висел).
    queryKey: [...unreadFeedKey(opts.userId ?? undefined, opts.l2Ids), opts.lastSeenAt ?? ""],
    queryFn: async () => {
      if (!opts.userId || opts.l2Ids.length === 0) return [];
      let q = supabase
        .from("orders")
        .select("id")
        .eq("status", "open")
        .neq("client_id", opts.userId)
        .or(orderCategoryFilter(opts.l2Ids))
        .order("created_at", { ascending: false })
        .limit(100);
      if (opts.lastSeenAt) {
        q = q.gt("created_at", opts.lastSeenAt);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row) => row.id as string);
    },
    enabled: !!opts.userId && opts.l2Ids.length > 0,
    staleTime: 15_000,
    // Бейдж обновляется при возврате в приложение (focusManager в _layout).
    refetchOnWindowFocus: true,
  });
  const ids = query.data;
  const responded = opts.respondedIds;
  const count = useMemo(
    () => (ids ?? []).filter((id) => !responded?.has(id)).length,
    [ids, responded],
  );
  return { data: count };
}

export function useMarkFeedSeen(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_feed_seen");
      if (error) throw error;
    },
    onSuccess: () => {
      // Значок гаснет сразу, не дожидаясь нового запроса.
      qc.setQueriesData<string[]>({ queryKey: ["unread-feed", userId] }, []);
      qc.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}
