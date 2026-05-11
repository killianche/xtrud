// Hook загрузки L2 категорий для стартовой витрины клиента.
// Фильтр: is_visible=true AND is_active=true (26 категорий на старте sprint 1.5).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type VisibleCategory = Tables<"categories_l2">;

export function useVisibleCategories() {
  return useQuery<VisibleCategory[]>({
    queryKey: ["categories", "visible-l2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories_l2")
        .select("*")
        .eq("is_visible", true)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60_000, // 30 минут — таксономия меняется редко
  });
}
