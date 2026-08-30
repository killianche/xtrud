// Hooks для приватности профиля мастера (sprint 0078).
//
// `useMasterPrivacy(userId)` — читает текущее значение is_hidden_from_search
// + сводное «видимость профиля для клиентов».
//
// `useUpdateMasterPrivacy()` — toggle is_hidden_from_search через RLS
// (master_profiles_update_own позволяет мастеру обновлять свой профиль).
//
// Используется в /(tabs)/profile/settings: toggle «Скрыть профиль от клиентов».

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MasterPrivacy {
  isHiddenFromSearch: boolean;
}

const KEY = (userId: string) => ["master-privacy", userId] as const;

export function useMasterPrivacy(userId: string | undefined) {
  return useQuery<MasterPrivacy>({
    queryKey: KEY(userId ?? ""),
    queryFn: async () => {
      if (!userId) return { isHiddenFromSearch: false };
      const { data, error } = await supabase
        .from("master_profiles")
        .select("is_hidden_from_search")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return {
        isHiddenFromSearch: data?.is_hidden_from_search ?? false,
      };
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export interface UpdateMasterPrivacyInput {
  userId: string;
  isHiddenFromSearch: boolean;
}

export function useUpdateMasterPrivacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isHiddenFromSearch }: UpdateMasterPrivacyInput) => {
      const { error } = await supabase
        .from("master_profiles")
        .update({ is_hidden_from_search: isHiddenFromSearch })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: ({ userId, isHiddenFromSearch }) => {
      // Optimistic — toggle мгновенно отзывается в UI.
      qc.setQueryData<MasterPrivacy>(KEY(userId), { isHiddenFromSearch });
    },
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: KEY(userId) });
      qc.invalidateQueries({ queryKey: ["master-public", userId] });
      // Каталог-запросы — инвалидация сбрасывает кэш всех «masters-by-l2».
      qc.invalidateQueries({ queryKey: ["masters-by-l2"] });
    },
    onError: (_e, { userId }) => {
      qc.invalidateQueries({ queryKey: KEY(userId) });
    },
  });
}
