/**
 * Mutation: редактирование уже-существующего master profile.
 *
 * Onboarding-create живёт через RPC `complete_master_onboarding` (Sprint 3.3),
 * она ставит `onboarding_completed_at`. После онбординга владелец редактирует
 * поля через простой UPDATE — два запроса:
 *  - users.first_name/last_name/city_id/district
 *  - master_profiles.bio/experience_years/has_tools/has_transport
 *
 * Не объединяем в один RPC — sprint 9 минимум, нужен ли единый transactional
 * UPDATE — пока нет, поля редактируются вместе с UI. Если будут race conditions
 * между UPDATE-ами — в Sprint 10 заведём RPC `update_master_profile`.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export interface UpdateMasterProfileInput {
  userId: string;
  firstName: string;
  lastName: string;
  cityId: string;
  district: string;
  bio: string;
  experienceYears: number;
  hasTools: boolean;
  hasTransport: boolean;
}

export function useUpdateMasterProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMasterProfileInput) => {
      const { error: usersErr } = await supabase
        .from("users")
        .update({
          first_name: input.firstName,
          last_name: input.lastName,
          city_id: input.cityId,
          district: input.district || null,
        })
        .eq("id", input.userId);
      if (usersErr) throw usersErr;

      const { error: profileErr } = await supabase
        .from("master_profiles")
        .update({
          bio: input.bio || null,
          experience_years: input.experienceYears,
          has_tools: input.hasTools,
          has_transport: input.hasTransport,
        })
        .eq("user_id", input.userId);
      if (profileErr) throw profileErr;
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
      queryClient.invalidateQueries({ queryKey: ["master-profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["master-public", userId] });
    },
  });
}
