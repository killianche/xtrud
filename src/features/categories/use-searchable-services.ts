/**
 * Плоский список услуг для typeahead-поиска на /search.
 *
 * Возвращает массив элементов { id, name_ru, l2_id, type } где:
 *   - L2-категории (видимые) идут с type="l2", l2_id = их id
 *   - L3-подкатегории идут с type="l3", l2_id = id родительской L2
 *
 * Используется в `/search` для построения typeahead-результатов
 * (как в Яндекс.Услугах: букву ввёл → услуги мгновенно).
 *
 * Кэш — 30 минут (таксономия меняется редко).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type SearchableService = {
  /** Уникальный id (l2.id или l3.id). */
  id: string;
  /** Локализованное название (то что показываем пользователю). */
  name_ru: string;
  /** id родительской L2 — используется для навигации на /category/[l2_id]. */
  l2_id: string;
  /** Тип записи. */
  type: "l2" | "l3";
};

export function useSearchableServices() {
  return useQuery<SearchableService[]>({
    queryKey: ["categories", "searchable-services"],
    queryFn: async () => {
      // L2 видимые + активные.
      const { data: l2s, error: l2err } = await supabase
        .from("categories_l2")
        .select("id, name_ru")
        .eq("is_visible", true)
        .eq("is_active", true)
        .order("sort_order");
      if (l2err) throw l2err;

      // L3 для этих L2 (фильтруем по l2_id).
      const l2Ids = (l2s ?? []).map((c) => c.id);
      let l3s: { id: string; name_ru: string; l2_id: string }[] = [];
      if (l2Ids.length > 0) {
        const { data: l3data, error: l3err } = await supabase
          .from("categories_l3")
          .select("id, name_ru, l2_id")
          .in("l2_id", l2Ids)
          .eq("is_active", true)
          .order("sort_order");
        if (l3err) throw l3err;
        l3s = l3data ?? [];
      }

      const result: SearchableService[] = [
        ...(l2s ?? []).map((c) => ({
          id: c.id,
          name_ru: c.name_ru,
          l2_id: c.id,
          type: "l2" as const,
        })),
        ...l3s.map((c) => ({
          id: c.id,
          name_ru: c.name_ru,
          l2_id: c.l2_id,
          type: "l3" as const,
        })),
      ];
      return result;
    },
    staleTime: 30 * 60_000,
  });
}
