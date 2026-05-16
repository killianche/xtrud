// Hook загрузки L2 категорий для стартовой витрины клиента.
// Фильтр: is_visible=true AND is_active=true AND L1 IN scope.
//
// **Product scope:** результат ещё фильтруется через `filterL2ByScope` —
// убирает L2 из out-of-scope L1-разделов (Бьюти, Авто, События и т.д.).
// См. `src/lib/product-scope.ts` и `CATEGORIES_AND_PROFILES.md` →
// раздел «Product scope (MVP)».

import { useQuery } from "@tanstack/react-query";
import { filterL2ByScope } from "@/lib/product-scope";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type VisibleCategory = Tables<"categories_l2">;

export function useVisibleCategories() {
  return useQuery<VisibleCategory[]>({
    queryKey: ["categories", "visible-l2", "in-scope"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories_l2")
        .select("*")
        .eq("is_visible", true)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return filterL2ByScope(data ?? []);
    },
    staleTime: 30 * 60_000, // 30 минут — таксономия меняется редко
  });
}
