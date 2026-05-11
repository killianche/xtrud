// Hook загрузки одной L2 категории + её L3 услуг.
// Используется на category/[id] экране.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type CategoryL2 = Tables<"categories_l2">;
export type CategoryL3 = Tables<"categories_l3">;

export interface CategoryDetail {
  category: CategoryL2;
  services: CategoryL3[];
}

export function useCategoryDetail(l2Id: string | undefined) {
  return useQuery<CategoryDetail | null>({
    queryKey: ["categories", "detail", l2Id],
    queryFn: async () => {
      if (!l2Id) return null;

      // 1. L2 категория
      const { data: category, error: catError } = await supabase
        .from("categories_l2")
        .select("*")
        .eq("id", l2Id)
        .eq("is_active", true)
        .maybeSingle();

      if (catError) throw catError;
      if (!category) return null;

      // 2. L3 услуги
      const { data: services, error: servicesError } = await supabase
        .from("categories_l3")
        .select("*")
        .eq("l2_id", l2Id)
        .eq("is_active", true)
        .order("sort_order");

      if (servicesError) throw servicesError;

      return {
        category,
        services: services ?? [],
      };
    },
    enabled: !!l2Id,
    staleTime: 30 * 60_000, // 30 минут
  });
}

/**
 * Форматирует медианную цену в "от X ₽" / "По договорённости".
 * Используется в category detail и master cards.
 */
export function formatAvgCheck(value: number | null): string {
  if (value === null) return "По договорённости";
  const formatted = new Intl.NumberFormat("ru-RU").format(value);
  return `от ${formatted} ₽`;
}

/**
 * Лейбл срочности на русском.
 */
export function urgencyLabel(urgency: CategoryL3["urgency_typical"]): string {
  switch (urgency) {
    case "urgent":
      return "Срочно";
    case "week":
      return "На неделе";
    case "month":
      return "В течение месяца";
  }
}
