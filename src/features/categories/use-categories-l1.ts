// Hook загрузки L1 категорий — для группировки L2-выбора по разделам
// (Строительство и ремонт, Дом и быт, ...).
//
// Используется в CategoryTreeSheet / master-categories онбординге для
// иерархического выбора L1 → L2.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type CategoryL1 = Tables<"categories_l1">;

export function useCategoriesL1() {
  return useQuery<CategoryL1[]>({
    queryKey: ["categories", "l1"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories_l1")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60_000,
  });
}
