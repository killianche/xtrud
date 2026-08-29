// Hook загрузки L2 категорий для стартовой витрины клиента.
// Фильтр: is_visible=true AND is_active=true AND L1 IN scope.
//
// **Product scope:** результат ещё фильтруется через `filterL2ByScope` —
// убирает L2 из out-of-scope L1-разделов (Бьюти, Авто, События и т.д.).
// См. `src/lib/product-scope.ts` и `CATEGORIES_AND_PROFILES.md` →
// раздел «Product scope (MVP)».

import { useQuery } from "@tanstack/react-query";
import {
  type BundledVisibleCategory,
  loadVisibleTaskCatalogWithFallback,
  type SourcedVisibleCategories,
} from "@/features/categories/bundled-task-catalog";
import { filterL2ByScope } from "@/lib/product-scope";
import { supabase } from "@/lib/supabase";

export type VisibleCategory = BundledVisibleCategory;

async function fetchVisibleCategories(): Promise<VisibleCategory[]> {
  const { data, error } = await supabase
    .from("categories_l2")
    .select("id,l1_id,name_ru,icon,sort_order,is_active,is_visible,is_featured")
    .eq("is_visible", true)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return filterL2ByScope(data ?? []);
}

export function useVisibleCategories() {
  const result = useQuery<SourcedVisibleCategories>({
    queryKey: ["categories", "visible-l2", "in-scope"],
    queryFn: () => loadVisibleTaskCatalogWithFallback(fetchVisibleCategories),
    staleTime: (queryState) => (queryState.state.data?.source === "bundle" ? 0 : 30 * 60_000),
    refetchOnReconnect: true,
  });

  return {
    ...result,
    data: result.data?.items,
    source: result.data?.source ?? null,
  };
}
