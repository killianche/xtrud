// Hook загрузки master_categories текущего пользователя-мастера.
// JOIN на categories_l2 чтобы UI сразу видел name_ru/icon без отдельного запроса.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type MasterCategory = Tables<"master_categories">;

export interface MasterCategoryWithL2 extends MasterCategory {
  l2: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon"> | null;
}

export function myCategoriesKey(userId: string | undefined) {
  return ["my-master-categories", userId] as const;
}

export function useMyMasterCategories(userId: string | undefined) {
  return useQuery<MasterCategoryWithL2[]>({
    queryKey: myCategoriesKey(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("master_categories")
        .select("*, l2:categories_l2(id, name_ru, icon)")
        .eq("master_id", userId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as MasterCategoryWithL2[];
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}
