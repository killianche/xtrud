// Mutation: атомарно синхронизировать master_categories со списком L2-id.
// Использует RPC set_master_categories (DELETE not-in + INSERT new).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myCategoriesKey } from "@/features/master-categories/use-my-categories";
import { supabase } from "@/lib/supabase";

export interface SetMasterCategoriesInput {
  userId: string;
  /** Список L2-id (slug-ов категорий). Максимум 5. */
  l2Ids: string[];
}

export function useSetMasterCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ l2Ids }: SetMasterCategoriesInput) => {
      const { error } = await supabase.rpc("set_master_categories", {
        p_l2_ids: l2Ids,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: myCategoriesKey(userId) });
    },
  });
}
