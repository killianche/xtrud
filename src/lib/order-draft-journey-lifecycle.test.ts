import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  removeItem: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/storage", () => ({
  largeSecureStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: storageMocks.removeItem,
  },
}));

import {
  applyGuestDraftAuthAbandonment,
  revokeGuestDraftAuthJourney,
  shouldAbandonGuestDraftAuthJourney,
} from "./order-draft-store";

describe("guest draft auth journey lifecycle", () => {
  beforeEach(() => {
    storageMocks.removeItem.mockReset();
    storageMocks.removeItem.mockResolvedValue(undefined);
  });

  it("preserves success REPLACE even when auth event beats the mutation promise", () => {
    expect(shouldAbandonGuestDraftAuthJourney("phone", { type: "REPLACE" })).toBe(false);
    expect(shouldAbandonGuestDraftAuthJourney("register", { type: "REPLACE" }, "sheet")).toBe(
      false,
    );
  });

  it("abandons phone Back but preserves phone to register PUSH/NAVIGATE", () => {
    for (const type of ["GO_BACK", "POP", "POP_TO_TOP"]) {
      expect(shouldAbandonGuestDraftAuthJourney("phone", { type })).toBe(true);
    }
    expect(
      shouldAbandonGuestDraftAuthJourney("phone", {
        type: "PUSH",
        targetRoute: "register",
      }),
    ).toBe(false);
    expect(
      shouldAbandonGuestDraftAuthJourney("phone", {
        type: "NAVIGATE",
        targetRoute: "(auth)/register",
      }),
    ).toBe(false);
  });

  it("handles register system Back by explicit auth origin", () => {
    expect(shouldAbandonGuestDraftAuthJourney("register", { type: "GO_BACK" }, "phone")).toBe(
      false,
    );
    expect(shouldAbandonGuestDraftAuthJourney("register", { type: "GO_BACK" }, "sheet")).toBe(true);
    expect(shouldAbandonGuestDraftAuthJourney("register", { type: "POP" }, null)).toBe(true);
  });

  it("cleans the guest journey before the phone UI Back safe REPLACE", () => {
    const clearReturnIntent = vi.fn();
    const revokeJourney = vi.fn();
    const actions = { clearReturnIntent, revokeJourney };

    applyGuestDraftAuthAbandonment(false, actions);
    expect(clearReturnIntent).not.toHaveBeenCalled();
    expect(revokeJourney).not.toHaveBeenCalled();

    applyGuestDraftAuthAbandonment(true, actions);
    expect(clearReturnIntent).toHaveBeenCalledOnce();
    expect(revokeJourney).toHaveBeenCalledOnce();
  });

  it("keeps storage cleanup best-effort and never rejects navigation cleanup", async () => {
    storageMocks.removeItem.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(revokeGuestDraftAuthJourney()).resolves.toBeUndefined();
  });
});
