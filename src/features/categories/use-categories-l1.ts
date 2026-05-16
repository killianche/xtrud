// Hook загрузки L1 категорий — для группировки L2-выбора по разделам
// (Строительство и ремонт, Дом и быт, ...).
//
// Используется в CategoryTreeSheet / master-categories онбординге для
// иерархического выбора L1 → L2.
//
// **Product scope:** результат отфильтрован через `filterL1ByScope` —
// показываем только L1, перечисленные в `IN_SCOPE_L1_IDS` (сейчас только
// `construction`). См. `src/lib/product-scope.ts` и `CATEGORIES_AND_PROFILES.md`
// → раздел «Product scope (MVP)». Расширение каталога — правкой одной
// константы, без миграций.

import { useQuery } from "@tanstack/react-query";
import { filterL1ByScope } from "@/lib/product-scope";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type CategoryL1 = Tables<"categories_l1">;

export function useCategoriesL1() {
  return useQuery<CategoryL1[]>({
    queryKey: ["categories", "l1", "in-scope"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories_l1")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return filterL1ByScope(data ?? []);
    },
    staleTime: 30 * 60_000,
  });
}
