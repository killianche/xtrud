// Mutation: завершить онбординг с выбранной ролью.
//
// Обновляет в public.users:
//   - is_client = true (всегда — клиентом может быть каждый)
//   - is_master = true если выбрал 'master'
//   - active_role = выбранная роль
//   - onboarding_completed_at = now()
//
// После успеха инвалидирует кэш useUserRecord → AuthGate перенаправит на /(tabs).
// Создание master_profiles записи (для is_master=true) делается в sprint 3 wizard.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export type OnboardingRole = Enums<"user_active_role">; // 'client' | 'master'

export interface CompleteOnboardingInput {
  userId: string;
  role: OnboardingRole;
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: CompleteOnboardingInput) => {
      const { error } = await supabase
        .from("users")
        .update({
          is_master: role === "master",
          active_role: role,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: (_data, { userId }) => {
      // Инвалидируем кэш — AuthGate увидит onboarding_completed_at ≠ null
      // и редиректнет в /(tabs).
      queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}
