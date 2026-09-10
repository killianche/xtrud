const PUBLIC_DETAIL_ROUTES = new Set([
  "case/[caseId]",
  "category/[id]",
  "category/city-select",
  "category/l3-select",
  "client/[id]",
  "find/category-select",
  "find/location-select",
  "master/[id]",
  "master-cases/[id]",
  "orders/[id]",
  "orders/new",
  "orders/new/budget",
  "orders/new/contacts",
  "orders/new/details",
  "orders/new/review",
  "orders/new/title",
  "orders/new/when",
  "orders/new/where",
  "orders/publish-auth",
  "orders/respond-auth",
  "search",
  "specialists/category-select",
  "specialists/section",
  "useful",
  "useful/[slug]",
]);

/** Explicit anonymous allowlist for the root details Stack. Private owner,
 * profile, history and admin routes fail closed when new files are added. */
export function isPublicDetailsRoute(segments: readonly string[]): boolean {
  if (segments[0] !== "(details)") return false;
  return PUBLIC_DETAIL_ROUTES.has(segments.slice(1).join("/"));
}
