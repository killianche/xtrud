import { describe, expect, it } from "vitest";
import { shouldHideTabBarForPath } from "./tabbar-route-policy";

describe("tab bar route policy", () => {
  it.each(["/", "/find", "/orders", "/orders/", "/cases", "/profile"])(
    "keeps the tab bar on root %s",
    (path) => expect(shouldHideTabBarForPath(path)).toBe(false),
  );

  it.each([
    "/orders/new",
    "/orders/category-select",
    "/orders/location-select",
    "/find/filters",
    "/orders/edit/42",
    "/profile/edit-client",
    "/profile/edit-master",
    "/cases/42",
  ])("hides the tab bar on full-screen route %s", (path) =>
    expect(shouldHideTabBarForPath(path)).toBe(true),
  );
});
