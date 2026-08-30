// Hook загрузки L2 featured-категорий — отображаются на главной клиента
// в hero-зоне крупными plate-карточками над обычной сеткой.
//
// Фильтр: is_featured = true AND is_visible = true AND is_active = true.
// Текущая выборка: cleaning + plumbing (см. 0034_categories_is_featured.sql).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type FeaturedCategory = Tables<"categories_l2">;

export function useFeaturedCategories() {
  return useQuery<FeaturedCategory[]>({
    queryKey: ["categories", "featured-l2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories_l2")
        .select("*")
        .eq("is_featured", true)
        .eq("is_visible", true)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60_000,
  });
}
