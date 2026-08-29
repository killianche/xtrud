import { describe, expect, it } from "vitest";
import { mayPopLocalStack } from "./nav-back-policy";

describe("mayPopLocalStack", () => {
  it("does not pop the synthetic root route under a cold deep link", () => {
    expect(mayPopLocalStack({ localIsRoot: true, hasTrackedCaller: false })).toBe(false);
  });

  it("pops a root Stack when the user opened the screen in-app", () => {
    expect(mayPopLocalStack({ localIsRoot: true, hasTrackedCaller: true })).toBe(true);
  });

  it("lets a nested Stack own its initial-route fallback", () => {
    expect(mayPopLocalStack({ localIsRoot: false, hasTrackedCaller: false })).toBe(true);
  });
});
