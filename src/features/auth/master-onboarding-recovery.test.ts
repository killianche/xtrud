import { describe, expect, it } from "vitest";
import { markMasterOnboardingActive, needsMasterFinalization } from "./master-onboarding-recovery";

describe("master onboarding recovery", () => {
  it.each(["draft", "pending"] as const)("recovers an enabled master with %s profile", (status) => {
    expect(needsMasterFinalization(true, status)).toBe(true);
  });

  it("does not intercept an active master", () => {
    expect(needsMasterFinalization(true, "active")).toBe(false);
    expect(needsMasterFinalization(false, "draft")).toBe(false);
  });

  it("marks a successful retry active synchronously before navigation", () => {
    let cachedStatus: "draft" | "active" = "draft";
    markMasterOnboardingActive("user-1", (_key, status) => {
      cachedStatus = status;
    });

    expect(cachedStatus).toBe("active");
    expect(needsMasterFinalization(true, cachedStatus)).toBe(false);
  });
});
