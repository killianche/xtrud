// Hook для загрузки записи public.users текущего пользователя.
//
// Возвращает {data, isLoading, error, refetch}. Используется AuthGate для
// проверки onboarding_completed_at (NULL → редирект на /(onboarding)/role).
//
// Кэш ключ ['user-record', userId] инвалидируется после mutation update_user.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type UserRecord = Tables<"users">;

export function userRecordKey(userId: string | undefined) {
  return ["user-record", userId] as const;
}

export function useUserRecord(userId: string | undefined) {
  return useQuery<UserRecord | null>({
    queryKey: userRecordKey(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    // Долгий staleTime: запись пользователя меняется только при явных action
    staleTime: 5 * 60_000,
  });
}
