import { describe, expect, it } from "vitest";
import {
  isOrderAfterCursor,
  parseUniversalOrderCursor,
  serializeUniversalOrderCursor,
} from "./universal-feed-cursor";

const cursor = {
  createdAt: "2026-08-23T12:30:00.000Z",
  id: "550e8400-e29b-41d4-a716-446655440000",
};

describe("universal order cursor", () => {
  it("round-trips the exact created_at and id tuple", () => {
    expect(parseUniversalOrderCursor(serializeUniversalOrderCursor(cursor))).toEqual(cursor);
  });

  it("canonicalizes timezone offsets to the same UTC instant", () => {
    const offsetCursor = {
      ...cursor,
      createdAt: "2026-08-23T15:30:00.000+03:00",
    };

    expect(parseUniversalOrderCursor(serializeUniversalOrderCursor(offsetCursor))).toEqual(cursor);
    expect(
      isOrderAfterCursor({ ...cursor, id: "450e8400-e29b-41d4-a716-446655440000" }, offsetCursor),
    ).toBe(true);
  });

  it("rejects malformed or partial cursors", () => {
    expect(parseUniversalOrderCursor("2026-08-23T12%3A30%3A00.000Z")).toBeNull();
    expect(parseUniversalOrderCursor("bad~not-a-uuid")).toBeNull();
    expect(parseUniversalOrderCursor("bad%ZZ~550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    expect(
      parseUniversalOrderCursor(
        "2026-08-23T12%3A30%3A00.1234567890Z~550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toBeNull();
  });

  it("orders timestamp ties by id in the same descending keyset direction", () => {
    expect(
      isOrderAfterCursor({ ...cursor, id: "450e8400-e29b-41d4-a716-446655440000" }, cursor),
    ).toBe(true);
    expect(
      isOrderAfterCursor({ ...cursor, id: "650e8400-e29b-41d4-a716-446655440000" }, cursor),
    ).toBe(false);
  });

  it("compares real instants and preserves PostgreSQL sub-millisecond precision", () => {
    expect(
      isOrderAfterCursor({ ...cursor, createdAt: "2026-08-23T14:00:00.000+03:00" }, cursor),
    ).toBe(true);
    expect(
      isOrderAfterCursor(
        { ...cursor, createdAt: "2026-08-23T12:30:00.123454Z" },
        { ...cursor, createdAt: "2026-08-23T12:30:00.123455Z" },
      ),
    ).toBe(true);
    expect(
      isOrderAfterCursor(
        { ...cursor, createdAt: "2026-08-23T12:30:00.123456Z" },
        { ...cursor, createdAt: "2026-08-23T12:30:00.123455Z" },
      ),
    ).toBe(false);
  });
});
