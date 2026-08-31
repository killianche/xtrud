// Hook: лента ВСЕХ открытых заказов сайта (для master-search).
//
// В отличие от useMasterFeed, не фильтрует по l2_id мастера —
// показывает заказы из любых категорий. Используется на /find (таб «Найти
// задание») и в блоке «Актуальные задания» на главной мастера.
// Фильтр по конкретной L2 — на клиенте (multi-select chips).
//
// neq client_id != my own (мастер не должен видеть свои заказы).

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  buildFeedPage,
  FEED_PAGE_SIZE,
  type FeedCursor,
  feedCursorFilter,
} from "@/features/orders/feed-page";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { shouldHideDemo } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";

type Page = { rows: OrderWithRefs[]; nextCursor: FeedCursor | null };

interface UseAllOpenOrdersInput {
  userId: string | undefined;
  /** Опц. фильтр по конкретным L2-id (если null — все категории). */
  l2Ids?: string[] | null;
  /** Опц. фильтр по локации. Передавай "" / undefined чтобы не фильтровать
   *  («Вся Ингушетия»). cityId и district взаимоисключающие (см. фильтр-стор). */
  cityId?: string | null;
  district?: string | null;
}

export function useAllOpenOrders({ userId, l2Ids, cityId, district }: UseAllOpenOrdersInput) {
  // Нормализуем пустые строки в null — чтобы queryKey и условия были стабильны.
  const cityFilter = cityId ? cityId : null;
  const districtFilter = district ? district : null;
  return useInfiniteQuery<Page>({
    queryKey: [
      "all-open-orders",
      userId ?? "anon",
      l2Ids ?? null,
      cityFilter,
      districtFilter,
    ] as const,
    initialPageParam: null as FeedCursor | null,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as FeedCursor | null;
      const hideDemo = shouldHideDemo();
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
          hideDemo
            ? "*, l2:categories_l2(id, name_ru, icon), city:cities(id, name), client:users!orders_client_id_fkey!inner(is_demo)"
            : "*, l2:categories_l2(id, name_ru, icon), city:cities(id, name), client:users!orders_client_id_fkey(is_demo)",
        )
        .eq("status", "open")
        .limit(FEED_PAGE_SIZE);

      // Фильтруем demo на сервере ДО limit/cursor. Клиентская фильтрация после
      // limit обрезала пагинацию, если в полной сырой странице встречался demo.
      if (hideDemo) {
        q = q.eq("client.is_demo", false);
      }

      // Свои заказы не показываем в ленте — но только когда юзер известен.
      // У анона своих заказов нет, фильтр не нужен.
      if (userId) {
        q = q.neq("client_id", userId);
      }

      if (l2Ids && l2Ids.length > 0) {
        q = q.in("l2_id", l2Ids);
      }

      // Локация-фильтр: город ИЛИ район (взаимоисключающие). Пусто = без фильтра
      // («Вся Ингушетия» — мастер видит заявки из всех мест).
      if (cityFilter) {
        q = q.eq("city_id", cityFilter);
      } else if (districtFilter) {
        q = q.eq("district", districtFilter);
      }

      q = q.order("created_at", { ascending: false }).order("id", { ascending: false });

      if (cursor) {
        q = q.or(feedCursorFilter(cursor));
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as OrderWithRefs[];
      return buildFeedPage(rows, FEED_PAGE_SIZE);
    },
    getNextPageParam: (last) => last.nextCursor,
    // enabled всегда true — анон тоже грузит ленту (см. комментарий в queryFn).
    staleTime: 30_000,
  });
}
