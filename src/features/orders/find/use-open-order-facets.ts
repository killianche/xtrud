/**
 * Лёгкий список всех открытых заданий — только категории и место, без
 * текста и фото. Из него экран выбора «Найти задание» считает, сколько
 * заданий в каждом разделе и категории (open-order-facets.ts). Один запрос
 * на экран; те же правила видимости, что у ленты (use-all-open-orders.ts):
 * свои задания не считаются, демо скрывается на сервере.
 */

import { useQuery } from "@tanstack/react-query";
import { shouldHideDemo } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";
import type { OpenOrderFacetRow } from "./open-order-facets";

/** Предел строк: открытых заданий десятки; с запасом на рост. */
const FACETS_LIMIT = 2000;

export function useOpenOrderFacets(userId: string | undefined) {
  return useQuery<OpenOrderFacetRow[]>({
    queryKey: ["open-order-facets", userId ?? "anon"] as const,
    queryFn: async () => {
      const hideDemo = shouldHideDemo();
      let q = supabase
        .from("orders")
        .select(
          hideDemo
            ? "l2_id, extra_l2_ids, city_id, district, client:users!orders_client_id_fkey!inner(is_demo)"
            : "l2_id, extra_l2_ids, city_id, district",
        )
        .eq("status", "open")
        .limit(FACETS_LIMIT);
      if (hideDemo) q = q.eq("client.is_demo", false);
      if (userId) q = q.neq("client_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OpenOrderFacetRow[];
    },
    staleTime: 30_000,
    gcTime: 24 * 60 * 60_000,
  });
}
