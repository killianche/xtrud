import { describe, expect, it } from "vitest";
import { MAX_NAV_HISTORY_ENTRIES, popNavPath, recordNavPath } from "./nav-history-policy";

describe("nav history policy", () => {
  it("records distinct forward paths and ignores a duplicate render", () => {
    expect(recordNavPath([], "/orders")).toEqual(["/orders"]);
    expect(recordNavPath(["/orders"], "/orders")).toEqual(["/orders"]);
    expect(recordNavPath(["/orders"], "/orders/42")).toEqual(["/orders", "/orders/42"]);
  });

  it("reconciles a native pop instead of reopening the removed route later", () => {
    const afterSwipe = recordNavPath(["/orders", "/orders/42", "/master/7"], "/orders/42");

    expect(afterSwipe).toEqual(["/orders", "/orders/42"]);
    expect(popNavPath(afterSwipe)).toEqual({ stack: ["/orders"], previous: "/orders" });
  });

  it("pops exactly one fallback entry", () => {
    expect(popNavPath(["/", "/category/1", "/master/7"])).toEqual({
      stack: ["/", "/category/1"],
      previous: "/category/1",
    });
    expect(popNavPath(["/"])).toEqual({ stack: ["/"] });
  });

  it("keeps the newest bounded history entries", () => {
    const stack = Array.from({ length: MAX_NAV_HISTORY_ENTRIES }, (_, index) => `/route-${index}`);
    const next = recordNavPath(stack, "/latest");

    expect(next).toHaveLength(MAX_NAV_HISTORY_ENTRIES);
    expect(next[0]).toBe("/route-1");
    expect(next.at(-1)).toBe("/latest");
  });
});
