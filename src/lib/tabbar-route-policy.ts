const TAB_ROOT_PATHS = new Set(["/", "/find", "/orders", "/cases", "/profile"]);

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

/** Tabs are visible only on intentional roots; every nested form/detail/picker is full-screen. */
export function shouldHideTabBarForPath(pathname: string): boolean {
  return !TAB_ROOT_PATHS.has(normalizePath(pathname));
}
