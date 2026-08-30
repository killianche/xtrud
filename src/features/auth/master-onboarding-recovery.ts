import type { Enums } from "@/types/database";

export function needsMasterFinalization(
  isMaster: boolean,
  status: Enums<"master_status"> | null | undefined,
): boolean {
  return isMaster && (status === "draft" || status === "pending");
}

/** Update recovery cache synchronously before the final screen navigates. */
export function markMasterOnboardingActive(
  userId: string,
  setStatus: (key: readonly ["master-onboarding-status", string], status: "active") => void,
): void {
  setStatus(["master-onboarding-status", userId], "active");
}
