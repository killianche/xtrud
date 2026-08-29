import { describe, expect, it } from "vitest";
import {
  ActiveOrderLimitError,
  getOrderPublishCapacity,
  MAX_ACTIVE_ORDERS,
} from "@/features/orders/order-publish-capacity";

describe("getOrderPublishCapacity", () => {
  it("allows publication while an active slot remains", () => {
    expect(getOrderPublishCapacity(2)).toEqual({
      activeCount: 2,
      limit: 3,
      remaining: 1,
      canPublish: true,
    });
  });

  it("blocks at and above the limit", () => {
    expect(getOrderPublishCapacity(MAX_ACTIVE_ORDERS).canPublish).toBe(false);
    expect(getOrderPublishCapacity(MAX_ACTIVE_ORDERS + 2)).toMatchObject({
      activeCount: 5,
      remaining: 0,
      canPublish: false,
    });
  });

  it("normalizes invalid negative counts", () => {
    expect(getOrderPublishCapacity(-4)).toMatchObject({ activeCount: 0, remaining: 3 });
  });
});

describe("ActiveOrderLimitError", () => {
  it("exposes a stable client error code", () => {
    const error = new ActiveOrderLimitError();
    expect(error.code).toBe("active_order_limit_reached");
    expect(error.limit).toBe(3);
  });
});
