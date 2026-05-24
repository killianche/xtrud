// Hook: лента ВСЕХ открытых заказов сайта (для master-search).
//
// В отличие от useMasterFeed, не фильтрует по l2_id мастера —
// показывает заказы из любых категорий. Используется на /orders/search.
// Фильтр по конкретной L2 — на клиенте (multi-select chips).
//
// neq client_id != my own (мастер не должен видеть свои заказы).

import { useInfiniteQuery } from "@tanstack/react-query";
import { type OrderWithRefs } from "@/features/orders/use-my-orders";
import { shouldHideDemo } from "@/lib/demo-mode";
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
    queryKey: ["all-open-orders", userId ?? "anon", l2Ids ?? null, sort] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      // 2026-05-21: анон (нет userId) ТОЖЕ видит ленту. Раньше тут был
      // early-return пустого результата для анона → центральная кнопка
      // «Смотреть заказы» (доступна всем с 2026-05-20) показывала пустой
      // экран неавторизованным. RLS-политика orders_read_open_or_own
      // разрешает читать open-orders всем (роль public), запрос безопасен.
      // При попытке откликнуться анон упрётся в login-wall на странице
      // заказа — это правильная точка авторизации.
      let q = supabase
        .from("orders")
        .select(
          "*, l2:categories_l2(id, name_ru, icon), city:cities(id, name), client:users!orders_client_id_fkey(is_demo)",
        )
        .eq("status", "open")
        .limit(PAGE_SIZE);

      // Свои заказы не показываем в ленте — но только когда юзер известен.
      // У анона своих заказов нет, фильтр не нужен.
      if (userId) {
        q = q.neq("client_id", userId);
      }

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
      let rows = (data ?? []) as unknown as (OrderWithRefs & {
        client?: { is_demo: boolean } | null;
      })[];

      // P0-09: скрываем заказы от demo-клиентов в production (EXPO_PUBLIC_DEMO_MODE=false).
      if (shouldHideDemo()) {
        rows = rows.filter((r) => r.client?.is_demo !== true);
      }

      const nextCursor = rows.length === PAGE_SIZE ? (rows[rows.length - 1]?.created_at ?? null) : null;
      return { rows: rows as OrderWithRefs[], nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor,
    // enabled всегда true — анон тоже грузит ленту (см. комментарий в queryFn).
    staleTime: 30_000,
  });
}
