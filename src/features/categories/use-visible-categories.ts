// Hook загрузки L2 категорий для стартовой витрины клиента.
// Фильтр: is_visible=true AND is_active=true AND L1 IN scope.
//
// Какие разделы активны, решает база: L2 читаются только из разделов с
// `is_active = true` (join на categories_l1), см. src/lib/product-scope.ts.

import { useQuery } from "@tanstack/react-query";
import {
  type BundledVisibleCategory,
  loadVisibleTaskCatalogWithFallback,
  type SourcedVisibleCategories,
} from "@/features/categories/bundled-task-catalog";
import { supabase } from "@/lib/supabase";

export type VisibleCategory = BundledVisibleCategory;

async function fetchVisibleCategories(): Promise<VisibleCategory[]> {
  const { data, error } = await supabase
    .from("categories_l2")
    .select(
      "id,l1_id,name_ru,icon,sort_order,is_active,is_visible,is_featured,l1:categories_l1!inner(is_active)",
    )
    .eq("is_visible", true)
    .eq("is_active", true)
    .eq("l1.is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(({ l1: _l1, ...category }) => category);
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
