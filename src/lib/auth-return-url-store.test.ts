import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  storage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";

const ORDER_DETAIL = "/orders/4fd91df3-bb3d-4ec7-9ce0-0fddd1f6d7ab";

describe("auth return URL store", () => {
  beforeEach(() => {
    useAuthReturnUrlStore.getState().clearReturnUrl();
  });

  it("keeps performer onboarding attached to a safe task return URL", () => {
    useAuthReturnUrlStore.getState().requestPerformerOnboarding(ORDER_DETAIL);

    expect(useAuthReturnUrlStore.getState().peekReturnUrl()).toBe(ORDER_DETAIL);
    expect(useAuthReturnUrlStore.getState().isPerformerOnboardingRequested()).toBe(true);
  });

  it("clears performer onboarding when the return URL is consumed", () => {
    useAuthReturnUrlStore.getState().requestPerformerOnboarding(ORDER_DETAIL);

    expect(useAuthReturnUrlStore.getState().consumeReturnUrl()).toBe(ORDER_DETAIL);
    expect(useAuthReturnUrlStore.getState().isPerformerOnboardingRequested()).toBe(false);
  });

  it("rejects an unsafe performer return URL", () => {
    useAuthReturnUrlStore
      .getState()
      .requestPerformerOnboarding("https://evil.example/(tabs)/orders/fake");

    expect(useAuthReturnUrlStore.getState().peekReturnUrl()).toBeNull();
    expect(useAuthReturnUrlStore.getState().isPerformerOnboardingRequested()).toBe(false);
  });

  it("resets performer intent when a regular auth return is set", () => {
    useAuthReturnUrlStore.getState().requestPerformerOnboarding(ORDER_DETAIL);
    useAuthReturnUrlStore.getState().setReturnUrl(ORDER_DETAIL);

    expect(useAuthReturnUrlStore.getState().isPerformerOnboardingRequested()).toBe(false);
  });
});
