import { describe, expect, it } from "vitest";
import {
  shouldAutoResumeOrderDraft,
  shouldRedirectInvalidOrderDetails,
} from "@/features/orders/order-create-route-policy";

const validBase = {
  screenPhase: "details" as const,
  draftUiReady: true,
  categoriesReady: true,
  hasSelectedCategory: false,
  isBusy: false,
  isPublished: false,
};

describe("shouldRedirectInvalidOrderDetails", () => {
  it("redirects a cold details route without a category", () => {
    expect(shouldRedirectInvalidOrderDetails(validBase)).toBe(true);
  });

  it("waits for draft and catalogue hydration", () => {
    expect(shouldRedirectInvalidOrderDetails({ ...validBase, draftUiReady: false })).toBe(false);
    expect(shouldRedirectInvalidOrderDetails({ ...validBase, categoriesReady: false })).toBe(false);
  });

  it("does not interrupt publish or success", () => {
    expect(shouldRedirectInvalidOrderDetails({ ...validBase, isBusy: true })).toBe(false);
    expect(shouldRedirectInvalidOrderDetails({ ...validBase, isPublished: true })).toBe(false);
  });

  it("does not redirect intent or valid details", () => {
    expect(shouldRedirectInvalidOrderDetails({ ...validBase, screenPhase: "intent" })).toBe(false);
    expect(shouldRedirectInvalidOrderDetails({ ...validBase, hasSelectedCategory: true })).toBe(
      false,
    );
  });
});

describe("shouldAutoResumeOrderDraft", () => {
  const resumable = {
    screenPhase: "intent" as const,
    editIntentRequested: false,
    draftUiReady: true,
    ownerAlreadyHandled: false,
    hasValidIntent: true,
  };

  it("resumes a valid draft once", () => {
    expect(shouldAutoResumeOrderDraft(resumable)).toBe(true);
    expect(shouldAutoResumeOrderDraft({ ...resumable, ownerAlreadyHandled: true })).toBe(false);
  });

  it("keeps a cold-details Back on intent for editing", () => {
    expect(shouldAutoResumeOrderDraft({ ...resumable, editIntentRequested: true })).toBe(false);
  });

  it("never auto-resumes from details or an invalid draft", () => {
    expect(shouldAutoResumeOrderDraft({ ...resumable, screenPhase: "details" })).toBe(false);
    expect(shouldAutoResumeOrderDraft({ ...resumable, hasValidIntent: false })).toBe(false);
  });
});
