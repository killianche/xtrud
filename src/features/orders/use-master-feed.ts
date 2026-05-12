// Hook: лента заявок для мастера. Возвращает orders где:
//   - l2_id ∈ master_categories мастера
//   - status = 'open'
//   - client_id != userId
//
// Sprint 12.4: useInfiniteQuery с keyset pagination по created_at DESC.

import { useInfiniteQuery } from "@tanstack/react-query";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 20;

export function masterFeedKey(userId: string | undefined, l2Ids: string[]) {
  return ["master-feed", userId, l2Ids.slice().sort().join(",")] as const;
}

interface UseMasterFeedInput {
  userId: string | undefined;
  l2Ids: string[];
}

type Page = { rows: OrderWithRefs[]; nextCursor: string | null };

export function useMasterFeed({ userId, l2Ids }: UseMasterFeedInput) {
  return useInfiniteQuery<Page>({
    queryKey: masterFeedKey(userId, l2Ids),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!userId || l2Ids.length === 0) return { rows: [], nextCursor: null };
      let q = supabase
        .from("orders")
        .select("*, l2:categories_l2(id, name_ru, icon), city:cities(id, name)")
        .eq("status", "open")
        .neq("client_id", userId)
        .in("l2_id", l2Ids)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (typeof pageParam === "string") {
        q = q.lt("created_at", pageParam);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as OrderWithRefs[];
      const last = rows[rows.length - 1];
      const nextCursor = rows.length === PAGE_SIZE ? (last?.created_at ?? null) : null;
      return { rows, nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!userId && l2Ids.length > 0,
    staleTime: 30_000,
  });
}
