// Mutation: завершить онбординг мастера через RPC complete_master_onboarding.
// Атомарно обновляет users + UPSERT master_profiles.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export interface SubmitMasterProfileInput {
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

export function useSubmitMasterProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitMasterProfileInput) => {
      const { error } = await supabase.rpc("complete_master_onboarding", {
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_city_id: input.cityId,
        p_district: input.district,
        p_bio: input.bio,
        p_experience_years: input.experienceYears,
        p_has_tools: input.hasTools,
        p_has_transport: input.hasTransport,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}
