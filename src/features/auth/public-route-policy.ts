const PUBLIC_DETAIL_ROUTES = new Set([
  "case/[caseId]",
  "category/[id]",
  "category/city-select",
  "category/l3-select",
  "category/sort-select",
  "client/[id]",
  "find/category-select",
  "find/filters",
  "find/location-select",
  "master/[id]",
  "master-cases/[id]",
  "orders/[id]",
  "orders/category-select",
  "orders/date-select",
  "orders/location-select",
  "orders/new",
  "orders/new/details",
  "orders/publish-auth",
  "search",
  "useful",
  "useful/[slug]",
]);

/** Explicit anonymous allowlist for the root details Stack. Private owner,
 * profile, history and admin routes fail closed when new files are added. */
export function isPublicDetailsRoute(segments: readonly string[]): boolean {
  if (segments[0] !== "(details)") return false;
  return PUBLIC_DETAIL_ROUTES.has(segments.slice(1).join("/"));
}
