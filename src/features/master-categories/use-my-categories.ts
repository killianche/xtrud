// Hook загрузки master_categories текущего пользователя-мастера.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type MasterCategory = Tables<"master_categories">;

export function myCategoriesKey(userId: string | undefined) {
  return ["my-master-categories", userId] as const;
}

export function useMyMasterCategories(userId: string | undefined) {
  return useQuery<MasterCategory[]>({
    queryKey: myCategoriesKey(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("master_categories")
        .select("*")
        .eq("master_id", userId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}
