import { describe, expect, it } from "vitest";
import { sortResponses } from "./sort-responses";

type Row = { status: string; created_at: string; id: string };

const r = (id: string, status: string, created_at: string): Row => ({ id, status, created_at });

describe("sortResponses", () => {
  it("returns empty array unchanged", () => {
    expect(sortResponses([])).toEqual([]);
  });

  it("accepted goes first, then sent/viewed newest first, then rejected", () => {
    const rows: Row[] = [
      r("a", "rejected", "2026-05-01T10:00:00Z"),
      r("b", "sent", "2026-05-03T10:00:00Z"),
      r("c", "accepted", "2026-05-02T10:00:00Z"),
      r("d", "viewed", "2026-05-04T10:00:00Z"),
      r("e", "withdrawn", "2026-05-05T10:00:00Z"),
    ];
    expect(sortResponses(rows).map((x) => x.id)).toEqual(["c", "d", "b", "e", "a"]);
  });

  it("within same status group newer created_at first", () => {
    const rows: Row[] = [
      r("old", "sent", "2026-05-01T10:00:00Z"),
      r("new", "sent", "2026-05-02T10:00:00Z"),
      r("mid", "sent", "2026-05-01T15:00:00Z"),
    ];
    expect(sortResponses(rows).map((x) => x.id)).toEqual(["new", "mid", "old"]);
  });

  it("unknown status sinks to bottom", () => {
    const rows: Row[] = [
      r("x", "sent", "2026-05-02T10:00:00Z"),
      r("y", "weird_status", "2026-05-03T10:00:00Z"),
    ];
    expect(sortResponses(rows).map((x) => x.id)).toEqual(["x", "y"]);
  });

  it("does not mutate the input array", () => {
    const rows: Row[] = [
      r("a", "rejected", "2026-05-01T10:00:00Z"),
      r("b", "accepted", "2026-05-02T10:00:00Z"),
    ];
    const sorted = sortResponses(rows);
    expect(rows[0]?.id).toBe("a"); // input untouched
    expect(sorted[0]?.id).toBe("b");
  });
});
