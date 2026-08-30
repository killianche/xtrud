import { describe, expect, it } from "vitest";
import {
  AUTH_RETURN_TTL_MS,
  consumeAuthReturnIntent,
  createAuthReturnIntent,
  ORDER_CREATE_RETURN_TO,
  parseAuthReturnTo,
} from "./auth-return";

describe("auth return intent", () => {
  it("accepts only the allowlisted order-create route", () => {
    const orderDetail = "/orders/4fd91df3-bb3d-4ec7-9ce0-0fddd1f6d7ab";
    const legacyOrderDetail = "/(tabs)/orders/4fd91df3-bb3d-4ec7-9ce0-0fddd1f6d7ab";
    expect(parseAuthReturnTo(ORDER_CREATE_RETURN_TO)).toBe(ORDER_CREATE_RETURN_TO);
    expect(parseAuthReturnTo(orderDetail)).toBe(orderDetail);
    expect(parseAuthReturnTo("/(tabs)/orders/new")).toBe(ORDER_CREATE_RETURN_TO);
    expect(parseAuthReturnTo(legacyOrderDetail)).toBe(orderDetail);
    expect(parseAuthReturnTo([ORDER_CREATE_RETURN_TO, "https://evil.example"])).toBe(
      ORDER_CREATE_RETURN_TO,
    );
    expect(parseAuthReturnTo("https://evil.example")).toBeNull();
    expect(parseAuthReturnTo("/orders/new?next=https://evil.example")).toBeNull();
    expect(parseAuthReturnTo("/orders/not-a-uuid")).toBeNull();
  });

  it("consumes a live intent exactly once", () => {
    const now = 10_000;
    const intent = createAuthReturnIntent(ORDER_CREATE_RETURN_TO, now);
    const first = consumeAuthReturnIntent(intent, now + 1);
    const second = consumeAuthReturnIntent(first.nextIntent, now + 2);

    expect(first).toEqual({ returnTo: ORDER_CREATE_RETURN_TO, nextIntent: null });
    expect(second).toEqual({ returnTo: null, nextIntent: null });
  });

  it("falls back when there is no intent or it has expired", () => {
    const now = 20_000;
    expect(consumeAuthReturnIntent(null, now).returnTo).toBeNull();
    expect(
      consumeAuthReturnIntent(
        createAuthReturnIntent(ORDER_CREATE_RETURN_TO, now),
        now + AUTH_RETURN_TTL_MS,
      ).returnTo,
    ).toBeNull();
  });
});
