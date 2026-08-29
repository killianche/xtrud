const PUBLIC_DETAIL_ROUTES = new Set([
  "case/[caseId]",
  "category/[id]",
  "client/[id]",
  "master/[id]",
  "master-cases/[id]",
  "orders/[id]",
  "orders/category-select",
  "orders/location-select",
  "orders/new",
  "orders/new/details",
  "orders/search/category-select",
  "orders/search/filters",
  "orders/search/location-select",
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
