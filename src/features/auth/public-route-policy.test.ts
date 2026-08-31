import { describe, expect, it } from "vitest";
import { isPublicDetailsRoute } from "@/features/auth/public-route-policy";

describe("isPublicDetailsRoute", () => {
  it("allows public marketplace details and guest order creation", () => {
    expect(isPublicDetailsRoute(["(details)", "master", "[id]"])).toBe(true);
    expect(isPublicDetailsRoute(["(details)", "orders", "[id]"])).toBe(true);
    expect(isPublicDetailsRoute(["(details)", "orders", "new"])).toBe(true);
    expect(isPublicDetailsRoute(["(details)", "orders", "new", "details"])).toBe(true);
    expect(isPublicDetailsRoute(["(details)", "find", "filters"])).toBe(true);
    expect(isPublicDetailsRoute(["(details)", "useful", "[slug]"])).toBe(true);
  });

  it("rejects every private owner and admin detail area", () => {
    expect(isPublicDetailsRoute(["(details)", "admin", "index"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "profile", "settings"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "profile", "edit-client"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "cases", "[caseId]"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "orders", "edit", "[id]"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "orders", "my-responses"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "orders", "responses-history"])).toBe(false);
  });

  it("fails closed for unknown or non-details routes", () => {
    expect(isPublicDetailsRoute(["(details)", "future-private-screen"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "master", "future-private"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "useful", "future-private", "nested"])).toBe(false);
    expect(isPublicDetailsRoute(["(details)", "orders", "new", "future-private"])).toBe(false);
    expect(isPublicDetailsRoute(["(tabs)", "profile"])).toBe(false);
    expect(isPublicDetailsRoute([])).toBe(false);
  });
});
