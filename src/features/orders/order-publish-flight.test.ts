import { describe, expect, it, vi } from "vitest";
import { createOrderPublishFlightGate } from "./order-publish-flight";

describe("order publish single-flight gate", () => {
  it("rejects a second publish while the first network step is deferred", async () => {
    const gate = createOrderPublishFlightGate();
    const count = vi.fn();
    let release!: () => void;
    const deferred = new Promise<void>((resolve) => {
      release = resolve;
    });

    const publish = async () => {
      if (!gate.tryEnter()) return false;
      try {
        count();
        await deferred;
        return true;
      } finally {
        gate.leave();
      }
    };

    const first = publish();
    await expect(publish()).resolves.toBe(false);
    expect(count).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toBe(true);
    await Promise.resolve();
    expect(gate.isActive()).toBe(false);
  });
});
