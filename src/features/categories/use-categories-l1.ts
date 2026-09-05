// Hook загрузки L1 категорий — для группировки L2-выбора по разделам
// (Строительство и ремонт, Дом и быт, ...).
//
// Используется в CategoryTreeSheet / master-categories онбординге для
// иерархического выбора L1 → L2.
//
// Какие разделы показывать, решает база (`is_active`), а не список в коде —
// см. src/lib/product-scope.ts. Без сети разделы берутся из встроенного
// каталога, как и категории.

import { useQuery } from "@tanstack/react-query";
import {
  type BundledSection,
  getBundledSections,
} from "@/features/categories/bundled-task-catalog";
import { isNetworkTransportError } from "@/lib/network-transport-error";
import { supabase } from "@/lib/supabase";

export type CategoryL1 = BundledSection;

export function useCategoriesL1() {
  return useQuery<CategoryL1[]>({
    queryKey: ["categories", "l1", "active"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("categories_l1")
          .select("id,name_ru,icon,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order");
        if (error) throw error;
        return data ?? [];
      } catch (error) {
        // Нет сети — разделы из встроенного каталога, экран не пустой.
        if (!isNetworkTransportError(error)) throw error;
        return getBundledSections();
      }
    },
    staleTime: 30 * 60_000,
  });
}
