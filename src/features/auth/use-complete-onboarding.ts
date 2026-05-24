// Mutation: завершить онбординг с выбранной ролью + опционально имя клиента.
//
// Обновляет в public.users:
//   - is_master = true если выбрал 'master'
//   - active_role = выбранная роль
//   - first_name = (опционально) имя клиента — для master flow имя
//     заполняется отдельно через master-profile wizard
//   - onboarding_completed_at = now()
//
// После успеха инвалидирует кэш useUserRecord → AuthGate перенаправит на /(tabs).
//
// **Client flow с именем (фидбэк user 2026-05-18):**
//   /auth/phone → /auth/verify → /(onboarding)/role
//     → если выбрал 'client': push /(onboarding)/client-name → submit { role, firstName }
//     → если выбрал 'master': push /(onboarding)/master-categories (имя в master-profile)
//
// firstName опционален в API — мастер-wizard вызывает без него (имя
// записывается через RPC complete_master_onboarding).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export type OnboardingRole = Enums<"user_active_role">; // 'client' | 'master'

export interface CompleteOnboardingInput {
  userId: string;
  role: OnboardingRole;
  /** Опционально — имя клиента (для client-name onboarding-шага). */
  firstName?: string;
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role, firstName }: CompleteOnboardingInput) => {
      const updates: {
        is_master: boolean;
        active_role: OnboardingRole;
        onboarding_completed_at: string;
        first_name?: string;
      } = {
        is_master: role === "master",
        active_role: role,
        onboarding_completed_at: new Date().toISOString(),
      };
      const trimmed = firstName?.trim();
      if (trimmed) updates.first_name = trimmed;

      const { error } = await supabase.from("users").update(updates).eq("id", userId);

      if (error) throw error;
    },
    onSuccess: (_data, { userId }) => {
      // Инвалидируем кэш — AuthGate увидит onboarding_completed_at ≠ null
      // и редиректнет в /(tabs).
      queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}
