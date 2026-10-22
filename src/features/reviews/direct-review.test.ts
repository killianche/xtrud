import { describe, expect, it } from "vitest";
import {
  directReviewCounterMax,
  isDirectReviewTextValid,
  MAX_REVIEW_TEXT_LENGTH,
  MIN_DIRECT_REVIEW_TEXT_LENGTH,
  resolveMasterReviewAction,
} from "@/features/reviews/direct-review";

describe("isDirectReviewTextValid", () => {
  it("requires at least 20 characters after trimming", () => {
    expect(isDirectReviewTextValid("короткий")).toBe(false);
    expect(isDirectReviewTextValid("   ")).toBe(false);
    expect(isDirectReviewTextValid("а".repeat(19))).toBe(false);
    expect(isDirectReviewTextValid("а".repeat(20))).toBe(true);
    // Пробелы по краям не считаются — ★5 без слов дешевле всего накрутить.
    expect(isDirectReviewTextValid(`  ${"а".repeat(20)}  `)).toBe(true);
    expect(isDirectReviewTextValid(`  ${"а".repeat(19)}  `)).toBe(false);
  });
});

describe("directReviewCounterMax", () => {
  it("counts up to the minimum until it's reached, then up to the overall max", () => {
    expect(directReviewCounterMax(0)).toBe(MIN_DIRECT_REVIEW_TEXT_LENGTH);
    expect(directReviewCounterMax(19)).toBe(MIN_DIRECT_REVIEW_TEXT_LENGTH);
    expect(directReviewCounterMax(20)).toBe(MAX_REVIEW_TEXT_LENGTH);
    expect(directReviewCounterMax(500)).toBe(MAX_REVIEW_TEXT_LENGTH);
  });
});

describe("resolveMasterReviewAction", () => {
  const base = {
    isOwn: false,
    isGuest: false,
    hasReviewableOrder: false,
    hasDirectReview: false as boolean | undefined,
    isMasterProfilePublished: true,
  };

  it("hides the button on your own profile, regardless of anything else", () => {
    expect(resolveMasterReviewAction({ ...base, isOwn: true })).toBe("none");
    expect(
      resolveMasterReviewAction({ ...base, isOwn: true, hasReviewableOrder: true, isGuest: true }),
    ).toBe("none");
  });

  it("prioritizes a review by order over a direct review (counts toward rating)", () => {
    expect(resolveMasterReviewAction({ ...base, hasReviewableOrder: true })).toBe("order");
    expect(
      resolveMasterReviewAction({ ...base, hasReviewableOrder: true, hasDirectReview: true }),
    ).toBe("order");
  });

  it("allows a review by order even on an unpublished profile — the task was already completed", () => {
    expect(
      resolveMasterReviewAction({
        ...base,
        hasReviewableOrder: true,
        isMasterProfilePublished: false,
      }),
    ).toBe("order");
  });

  it("sends a guest to sign in instead of hiding the button", () => {
    expect(resolveMasterReviewAction({ ...base, isGuest: true })).toBe("guest");
  });

  it("offers a direct review once signed in, not already left one, and the profile is published", () => {
    expect(resolveMasterReviewAction({ ...base, hasDirectReview: false })).toBe("direct");
  });

  it("hides a direct review on an unpublished profile — the server would reject it", () => {
    expect(
      resolveMasterReviewAction({
        ...base,
        hasDirectReview: false,
        isMasterProfilePublished: false,
      }),
    ).toBe("none");
  });

  it("hides the button once a direct review was already left", () => {
    expect(resolveMasterReviewAction({ ...base, hasDirectReview: true })).toBe("none");
  });

  it("hides the button while it's still unknown whether one was already left", () => {
    expect(resolveMasterReviewAction({ ...base, hasDirectReview: undefined })).toBe("none");
  });
});
