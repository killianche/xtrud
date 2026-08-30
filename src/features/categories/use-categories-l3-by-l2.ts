// Hook загрузки L3 услуг внутри одной L2 категории.
//
// Используется в P0-4 — pre-defined услуги для прайса мастера.
// Мастер выбрал «Сантехника» → видит готовый список «Установка унитаза»,
// «Замена смесителя», «Прочистка засора» и т.д. (~290 L3 на 64 L2 → в
// среднем 4-5 L3 на L2).
//
// avg_check_rub из categories_l3 используется как placeholder-цена для
// подсказки «обычно берут X ₽» при заполнении прайса.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type CategoryL3 = Tables<"categories_l3">;

export function categoriesL3Key(l2Id: string | null | undefined) {
  return ["categories", "l3-by-l2", l2Id] as const;
}

export function useCategoriesL3ByL2(l2Id: string | null | undefined) {
  return useQuery<CategoryL3[]>({
    queryKey: categoriesL3Key(l2Id),
    queryFn: async () => {
      if (!l2Id) return [];
      const { data, error } = await supabase
        .from("categories_l3")
        .select("*")
        .eq("l2_id", l2Id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name_ru", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!l2Id,
    staleTime: 30 * 60_000, // таксономия меняется редко
  });
}
