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

/**
 * Проверяет номер сборки iOS против релизного ledger.
 *
 * App Store Connect отвергает повторную загрузку пары version+build, даже если
 * сборка не дошла до продажи и лежит только в TestFlight. Поэтому опубликованного
 * номера недостаточно: `latestUploadedBuildNumber` хранит наибольший уже
 * загруженный build, и новый обязан быть строго больше.
 *
 * Найдено 2026-08-30 запросом к App Store Connect: build 12 (v1.0.2) был VALID в
 * TestFlight, тогда как ledger содержал только latestPublishedBuildNumber = 11 —
 * гейт этого не видел и пропустил бы повторную загрузку.
 *
 * @returns {string[]} список причин отказа; пустой массив означает, что номер годен.
 */
export function checkIosBuildNumber({ build, published, uploaded }) {
  const failures = [];

  if (!Number.isInteger(build) || build < 1) {
    failures.push(
      `iOS buildNumber должен быть положительным целым, получено ${JSON.stringify(build)}`,
    );
    return failures;
  }

  if (Number.isInteger(published) && build < published) {
    failures.push(`iOS buildNumber ${build} меньше опубликованного ${published}`);
  }

  if (uploaded === undefined || uploaded === null) return failures;

  if (!Number.isInteger(uploaded) || uploaded < 1) {
    failures.push(
      `latestUploadedBuildNumber должен быть положительным целым, получено ${JSON.stringify(uploaded)}`,
    );
    return failures;
  }

  if (Number.isInteger(published) && uploaded < published) {
    failures.push(`latestUploadedBuildNumber ${uploaded} меньше опубликованного ${published}`);
  } else if (build <= uploaded) {
    failures.push(
      `iOS buildNumber ${build} уже загружен в App Store Connect (наибольший загруженный — ${uploaded}); подними номер`,
    );
  }

  return failures;
}
