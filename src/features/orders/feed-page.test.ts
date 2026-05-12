import { describe, expect, it } from "vitest";
import { buildFeedPage, FEED_PAGE_SIZE, masterFeedKey } from "./feed-page";

type Row = { created_at: string; id: string };
const r = (id: string, created_at: string): Row => ({ id, created_at });

describe("masterFeedKey", () => {
  it("returns stable key for same inputs", () => {
    expect(masterFeedKey("u1", ["a", "b"])).toEqual(masterFeedKey("u1", ["a", "b"]));
  });

  it("is independent of l2Ids order — [A,B] and [B,A] produce equal keys", () => {
    expect(masterFeedKey("u1", ["a", "b"])).toEqual(masterFeedKey("u1", ["b", "a"]));
  });

  it("uses different keys for different userId", () => {
    expect(masterFeedKey("u1", ["a"])).not.toEqual(masterFeedKey("u2", ["a"]));
  });

  it("uses different keys for different l2Ids set", () => {
    expect(masterFeedKey("u1", ["a", "b"])).not.toEqual(masterFeedKey("u1", ["a", "c"]));
  });

  it("does not mutate the input array", () => {
    const ids = ["c", "a", "b"];
    masterFeedKey("u1", ids);
    expect(ids).toEqual(["c", "a", "b"]);
  });

  it("handles empty l2Ids and undefined userId", () => {
    expect(masterFeedKey(undefined, [])).toEqual(["master-feed", undefined, ""]);
  });
});

describe("buildFeedPage", () => {
  it("empty rows → null cursor", () => {
    expect(buildFeedPage([], 20)).toEqual({ rows: [], nextCursor: null });
  });

  it("partial page (rows < pageSize) → null cursor — БД исчерпана", () => {
    const rows = [r("a", "2026-05-10T10:00:00Z"), r("b", "2026-05-09T10:00:00Z")];
    expect(buildFeedPage(rows, 20)).toEqual({ rows, nextCursor: null });
  });

  it("full page (rows === pageSize) → cursor = last row's created_at", () => {
    const rows = [
      r("x0", "2026-05-10T10:00:00Z"),
      r("x1", "2026-05-09T10:00:00Z"),
      r("x2", "2026-05-08T10:00:00Z"),
    ];
    const result = buildFeedPage(rows, 3);
    expect(result.rows).toBe(rows);
    expect(result.nextCursor).toBe("2026-05-08T10:00:00Z");
  });

  it("overfilled page (rows > pageSize, defensive) → null cursor", () => {
    // Так быть не должно (SQL .limit это блокирует), но проверяем что не падаем.
    const rows = [
      r("x0", "2026-05-10T10:00:00Z"),
      r("x1", "2026-05-09T10:00:00Z"),
      r("x2", "2026-05-08T10:00:00Z"),
      r("x3", "2026-05-07T10:00:00Z"),
      r("x4", "2026-05-06T10:00:00Z"),
    ];
    expect(buildFeedPage(rows, 3).nextCursor).toBeNull();
  });

  it("default pageSize = FEED_PAGE_SIZE (20)", () => {
    expect(FEED_PAGE_SIZE).toBe(20);
    const rows = Array.from({ length: 20 }, (_, i) =>
      r(`x${i}`, new Date(Date.UTC(2026, 4, 20 - i, 10, 0, 0)).toISOString()),
    );
    // last row = rows[19]; курсор должен быть равен его created_at
    expect(buildFeedPage(rows).nextCursor).toBe(rows[19]?.created_at);
  });
});
