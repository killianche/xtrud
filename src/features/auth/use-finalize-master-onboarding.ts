// Mutation: финализация master-онбординга (вызывается на ПОСЛЕДНЕМ шаге
// wizard — master-photo, после загрузки фото или skip).
//
// Sprint 2026-05-20 — reorder шагов: profile-step (1/3) сохраняет
// users/master_profiles данные через use-submit-master-profile, но НЕ
// финализирует. categories-step (2/3) — set_master_categories. photo-step
// (3/3) — этот хук + finalize_master_onboarding() RPC.
//
// Legacy RPC ставит is_master=true, active_role=master и onboarding_completed_at,
// но версия 0095 не публикует master_profiles. Поэтому после RPC доводим
// профиль до active через текущий owner-update contract. Операция идемпотентна:
// при сбое экран остаётся на финальном шаге, повторный тап безопасно завершает
// обе части. На self-hosted backend это нужно объединить в один атомарный RPC
// после live snapshot/backup, не переписывая уже применённую 0095.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markMasterOnboardingActive } from "@/features/auth/master-onboarding-recovery";
import { masterOnboardingStatusKey } from "@/features/auth/use-master-onboarding-status";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export function useFinalizeMasterOnboarding(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Пользователь не авторизован");
      const { error } = await supabase.rpc("finalize_master_onboarding");
      if (error) throw error;

      const { data: publishedProfile, error: publishError } = await supabase
        .from("master_profiles")
        .update({ status: "active" })
        .eq("user_id", userId)
        .select("user_id")
        .maybeSingle();
      if (publishError) throw publishError;
      if (!publishedProfile) throw new Error("Профиль исполнителя не найден");

      // Синхронно закрываем recovery gate ДО resolve mutateAsync/navigation.
      // Иначе stale draft cache мог вернуть успешного пользователя на photo.
      markMasterOnboardingActive(userId, (key, status) => {
        queryClient.setQueryData(key, status);
      });
    },
    onSettled: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
        queryClient.invalidateQueries({ queryKey: masterOnboardingStatusKey(userId) });
        queryClient.invalidateQueries({ queryKey: ["master-public", userId] });
      }
    },
  });
}
