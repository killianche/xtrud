// Hook: лента заявок для мастера. Возвращает orders где:
//   - l2_id ∈ master_categories мастера
//   - status = 'open'
//   - client_id != userId
//
// Sprint 12.4: useInfiniteQuery с keyset pagination по created_at DESC.
// Sprint 19.3: pure-логика выделена в `feed-page.ts` для unit-тестов.

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  buildFeedPage,
  FEED_PAGE_SIZE,
  type FeedCursor,
  feedCursorFilter,
  masterFeedKey,
} from "@/features/orders/feed-page";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { supabase } from "@/lib/supabase";

export { masterFeedKey };

interface UseMasterFeedInput {
  userId: string | undefined;
  l2Ids: string[];
}

type Page = { rows: OrderWithRefs[]; nextCursor: FeedCursor | null };

export function useMasterFeed({ userId, l2Ids }: UseMasterFeedInput) {
  return useInfiniteQuery<Page>({
    queryKey: masterFeedKey(userId, l2Ids),
    initialPageParam: null as FeedCursor | null,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as FeedCursor | null;
      if (!userId || l2Ids.length === 0) return { rows: [], nextCursor: null };
      let q = supabase
        .from("orders")
        .select("*, l2:categories_l2(id, name_ru, icon), city:cities(id, name)")
        .eq("status", "open")
        .neq("client_id", userId)
        .in("l2_id", l2Ids)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(FEED_PAGE_SIZE);
      if (cursor) {
        q = q.or(feedCursorFilter(cursor));
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as OrderWithRefs[];
      return buildFeedPage(rows, FEED_PAGE_SIZE);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!userId && l2Ids.length > 0,
    staleTime: 30_000,
  });
}
