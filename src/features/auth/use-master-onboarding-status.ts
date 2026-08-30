import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export const masterOnboardingStatusKey = (userId: string | undefined) =>
  ["master-onboarding-status", userId] as const;

/**
 * Durable recovery marker for the legacy two-step finalization contract.
 *
 * `users.is_master=true` together with master_profiles draft/pending means the
 * role RPC committed but profile publication did not. AuthGate must keep that
 * account in the final photo step until publication succeeds.
 */
export function useMasterOnboardingStatus(userId: string | undefined, enabled: boolean) {
  return useQuery<Enums<"master_status"> | null>({
    queryKey: masterOnboardingStatusKey(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_profiles")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data?.status ?? null;
    },
    enabled: !!userId && enabled,
    staleTime: 0,
  });
}
