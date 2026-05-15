// Hook: лента ВСЕХ открытых заказов сайта (для master-search).
//
// В отличие от useMasterFeed, не фильтрует по l2_id мастера —
// показывает заказы из любых категорий. Используется на /orders/search.
// Фильтр по конкретной L2 — на клиенте (multi-select chips).
//
// neq client_id != my own (мастер не должен видеть свои заказы).

import { useInfiniteQuery } from "@tanstack/react-query";
import { type OrderWithRefs } from "@/features/orders/use-my-orders";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 20;

type Page = { rows: OrderWithRefs[]; nextCursor: string | null };

interface UseAllOpenOrdersInput {
  userId: string | undefined;
  /** Опц. фильтр по конкретным L2-id (если null — все категории). */
  l2Ids?: string[] | null;
  /** Сортировка: 'newest' (по умолчанию) | 'urgent' (срочные сверху). */
  sort?: "newest" | "urgent";
}

export function useAllOpenOrders({ userId, l2Ids, sort = "newest" }: UseAllOpenOrdersInput) {
  return useInfiniteQuery<Page>({
    queryKey: ["all-open-orders", userId, l2Ids ?? null, sort] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!userId) return { rows: [], nextCursor: null };
      let q = supabase
        .from("orders")
        .select("*, l2:categories_l2(id, name_ru, icon), city:cities(id, name)")
        .eq("status", "open")
        .neq("client_id", userId)
        .limit(PAGE_SIZE);

      if (l2Ids && l2Ids.length > 0) {
        q = q.in("l2_id", l2Ids);
      }

      // Сортировка. Для urgent: сначала urgency='today' / 'asap',
      // потом по created_at. Для newest — просто created_at desc.
      if (sort === "urgent") {
        q = q
          .order("urgency", { ascending: true }) // 'asap' < 'today' < 'week' < 'flexible'
          .order("created_at", { ascending: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }

      if (typeof pageParam === "string") {
        q = q.lt("created_at", pageParam);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as OrderWithRefs[];
      const nextCursor = rows.length === PAGE_SIZE ? (rows[rows.length - 1]?.created_at ?? null) : null;
      return { rows, nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!userId,
    staleTime: 30_000,
  });
}
