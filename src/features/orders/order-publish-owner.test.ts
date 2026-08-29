import { describe, expect, it } from "vitest";
import {
  isOrderPublishResultForActiveUser,
  isOrderPublishSuccessVisible,
  resolveCommittedOrderPublishOwner,
} from "./order-publish-owner";

describe("order publish owner policy", () => {
  it("shows a deferred success only in the session that started it", () => {
    expect(isOrderPublishResultForActiveUser("user-a", "user-a", "user-a")).toBe(true);
    expect(isOrderPublishResultForActiveUser("user-a", "user-b", "user-b")).toBe(false);
    expect(isOrderPublishResultForActiveUser("user-a", undefined, undefined)).toBe(false);
  });

  it("rejects a result when auth changed before React rendered the new session", () => {
    expect(isOrderPublishResultForActiveUser("user-a", "user-a", "user-b")).toBe(false);
    expect(isOrderPublishSuccessVisible("user-a", "user-b")).toBe(false);
  });

  it("keeps an insert terminal but hides its id when the session read returns an error", async () => {
    await expect(
      resolveCommittedOrderPublishOwner("user-a", "user-a", async () => ({
        userId: undefined,
        error: new Error("storage unavailable"),
      })),
    ).resolves.toBe("unknown");
  });

  it("keeps an insert terminal but hides its id when the session read throws", async () => {
    await expect(
      resolveCommittedOrderPublishOwner("user-a", "user-a", async () => {
        throw new Error("session read failed");
      }),
    ).resolves.toBe("unknown");
  });
});
