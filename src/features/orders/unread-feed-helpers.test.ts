import { describe, expect, it } from "vitest";
import {
  shouldInvalidateFeedOnInsert,
  unreadFeedKey,
  unreadResponsesKey,
} from "./unread-feed-helpers";

describe("unreadFeedKey", () => {
  it("returns stable key for same inputs", () => {
    expect(unreadFeedKey("u1", ["a", "b"])).toEqual(unreadFeedKey("u1", ["a", "b"]));
  });

  it("is independent of l2Ids order", () => {
    expect(unreadFeedKey("u1", ["a", "b"])).toEqual(unreadFeedKey("u1", ["b", "a"]));
  });

  it("different userId → different key", () => {
    expect(unreadFeedKey("u1", ["a"])).not.toEqual(unreadFeedKey("u2", ["a"]));
  });

  it("does not mutate input array", () => {
    const ids = ["c", "a", "b"];
    unreadFeedKey("u1", ids);
    expect(ids).toEqual(["c", "a", "b"]);
  });

  it("handles undefined userId + empty l2Ids", () => {
    expect(unreadFeedKey(undefined, [])).toEqual(["unread-feed", undefined, ""]);
  });
});

describe("unreadResponsesKey", () => {
  it("returns stable key", () => {
    expect(unreadResponsesKey("u1")).toEqual(unreadResponsesKey("u1"));
  });

  it("different userId → different key", () => {
    expect(unreadResponsesKey("u1")).not.toEqual(unreadResponsesKey("u2"));
  });

  it("handles undefined", () => {
    expect(unreadResponsesKey(undefined)).toEqual(["unread-responses", undefined]);
  });
});

describe("shouldInvalidateFeedOnInsert", () => {
  const userId = "master-1";
  const l2Ids = ["plumbing", "electrical"];

  it("invalidates on open order with matching l2 from different client", () => {
    expect(
      shouldInvalidateFeedOnInsert(
        { status: "open", client_id: "client-1", l2_id: "plumbing" },
        userId,
        l2Ids,
      ),
    ).toBe(true);
  });

  it("ignores non-open status", () => {
    expect(
      shouldInvalidateFeedOnInsert(
        { status: "draft", client_id: "client-1", l2_id: "plumbing" },
        userId,
        l2Ids,
      ),
    ).toBe(false);
    expect(
      shouldInvalidateFeedOnInsert(
        { status: "in_progress", client_id: "client-1", l2_id: "plumbing" },
        userId,
        l2Ids,
      ),
    ).toBe(false);
  });

  it("ignores own orders (master case-creator)", () => {
    expect(
      shouldInvalidateFeedOnInsert(
        { status: "open", client_id: userId, l2_id: "plumbing" },
        userId,
        l2Ids,
      ),
    ).toBe(false);
  });

  it("ignores orders in l2 outside my categories", () => {
    expect(
      shouldInvalidateFeedOnInsert(
        { status: "open", client_id: "client-1", l2_id: "auto-repair" },
        userId,
        l2Ids,
      ),
    ).toBe(false);
  });

  it("ignores row with missing fields (defensive)", () => {
    expect(shouldInvalidateFeedOnInsert({}, userId, l2Ids)).toBe(false);
    expect(
      shouldInvalidateFeedOnInsert({ status: "open" }, userId, l2Ids),
    ).toBe(false);
    expect(
      shouldInvalidateFeedOnInsert({ status: "open", client_id: "x" }, userId, l2Ids),
    ).toBe(false);
  });

  it("ignores row with null l2_id", () => {
    expect(
      shouldInvalidateFeedOnInsert(
        { status: "open", client_id: "client-1", l2_id: null },
        userId,
        l2Ids,
      ),
    ).toBe(false);
  });

  it("returns false when l2Ids list is empty", () => {
    expect(
      shouldInvalidateFeedOnInsert(
        { status: "open", client_id: "client-1", l2_id: "plumbing" },
        userId,
        [],
      ),
    ).toBe(false);
  });
});
