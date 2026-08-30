import { describe, expect, it } from "vitest";
import { shouldHideTabBarForPath } from "./tabbar-route-policy";

describe("tab bar route policy", () => {
  it.each(["/", "/orders", "/orders/", "/orders/search", "/cases", "/profile", "/favorites"])(
    "keeps the tab bar on root %s",
    (path) => expect(shouldHideTabBarForPath(path)).toBe(false),
  );

  it.each([
    "/orders/new",
    "/orders/category-select",
    "/orders/location-select",
    "/orders/search/filters",
    "/orders/edit/42",
    "/profile/edit-client",
    "/profile/edit-master",
    "/cases/42",
  ])("hides the tab bar on full-screen route %s", (path) =>
    expect(shouldHideTabBarForPath(path)).toBe(true),
  );
});
