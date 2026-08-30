import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { MasterOnboardingProfileDraft } from "./master-onboarding-draft";

export const masterOnboardingDraftKey = (userId: string | undefined) =>
  ["master-onboarding-draft", userId] as const;

export function useMasterOnboardingDraft(userId: string | undefined) {
  return useQuery<MasterOnboardingProfileDraft | null>({
    queryKey: masterOnboardingDraftKey(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_profiles")
        .select("bio, experience_years, whatsapp_phone, whatsapp_same_as_phone")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 0,
  });
}
