import { describe, expect, it } from "vitest";
import { PROMPT_THRESHOLD_MS, shouldShowOutcomePrompt, useOutcomeStore } from "./outcome-store";

const now = 1_700_000_000_000; // фиксированное "сейчас" для теста
const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

const base = {
  isOwner: true,
  orderStatus: "in_progress",
  pickedMasterId: "master-1",
  updatedAt: fourDaysAgo,
  orderId: "order-1",
  now,
  isDismissed: () => false,
};

describe("shouldShowOutcomePrompt", () => {
  it("hides for non-owner", () => {
    expect(shouldShowOutcomePrompt({ ...base, isOwner: false })).toBe(false);
  });

  it("hides when status not in_progress", () => {
    expect(shouldShowOutcomePrompt({ ...base, orderStatus: "open" })).toBe(false);
    expect(shouldShowOutcomePrompt({ ...base, orderStatus: "completed" })).toBe(false);
  });

  it("hides when no picked_master", () => {
    expect(shouldShowOutcomePrompt({ ...base, pickedMasterId: null })).toBe(false);
  });

  it("hides when updatedAt newer than threshold (1 day)", () => {
    expect(shouldShowOutcomePrompt({ ...base, updatedAt: oneDayAgo })).toBe(false);
  });

  it("hides for invalid updatedAt", () => {
    expect(shouldShowOutcomePrompt({ ...base, updatedAt: "not-a-date" })).toBe(false);
  });

  it("hides when dismissed", () => {
    expect(shouldShowOutcomePrompt({ ...base, isDismissed: () => true })).toBe(false);
  });

  it("shows when all conditions met (≥ threshold, not dismissed, owner, in_progress, picked)", () => {
    expect(shouldShowOutcomePrompt(base)).toBe(true);
  });
});

describe("useOutcomeStore", () => {
  it("dismissFor sets a future timestamp and isDismissed returns true within window", () => {
    const store = useOutcomeStore.getState();
    store.dismissFor("order-x", PROMPT_THRESHOLD_MS);
    expect(useOutcomeStore.getState().isDismissed("order-x")).toBe(true);
  });

  it("isDismissed returns false for unknown orderId", () => {
    expect(useOutcomeStore.getState().isDismissed("never-set")).toBe(false);
  });
});
