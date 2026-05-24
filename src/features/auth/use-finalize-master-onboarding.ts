// Mutation: финализация master-онбординга (вызывается на ПОСЛЕДНЕМ шаге
// wizard — master-photo, после загрузки фото или skip).
//
// Sprint 2026-05-20 — reorder шагов: profile-step (1/3) сохраняет
// users/master_profiles данные через use-submit-master-profile, но НЕ
// финализирует. categories-step (2/3) — set_master_categories. photo-step
// (3/3) — этот хук + finalize_master_onboarding() RPC.
//
// RPC ставит is_master=true, active_role=master, onboarding_completed_at=now().
// AuthGate видит onboarding_completed_at != null и редиректит в /(tabs).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export function useFinalizeMasterOnboarding(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("finalize_master_onboarding");
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
        queryClient.invalidateQueries({ queryKey: ["master-public", userId] });
      }
    },
  });
}
