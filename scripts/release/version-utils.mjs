/**
 * App Store marketing versions are numeric and contain up to three components.
 * Keep comparison independent from npm semver: Apple versions have no prerelease
 * syntax, and treating 1.0 as 1.0.0 prevents accidental rollback on a later build.
 */

function parseMarketingVersion(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+){0,2}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  while (parts.length < 3) parts.push(0);
  return parts;
}

export function compareMarketingVersions(left, right) {
  const leftParts = parseMarketingVersion(left);
  const rightParts = parseMarketingVersion(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}
