#!/usr/bin/env node
/**
 * Keep the user-facing app version and native build source deterministic.
 * EAS reads versions from app.json in local mode, while npm metadata has two
 * additional copies; drift between them makes releases impossible to identify.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkIosBuildNumber, compareMarketingVersions } from "./version-utils.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");

function readJson(file) {
  return JSON.parse(readFileSync(resolve(ROOT, file), "utf8"));
}

const app = readJson("app.json");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const eas = readJson("eas.json");
const release = readJson("release/production.json");

const versions = {
  "app.json expo.version": app.expo?.version,
  "package.json version": packageJson.version,
  "package-lock.json root version": packageLock.packages?.[""]?.version,
};
const failures = [];
const releaseBackendUrl = release.backend?.url;
const easBackendUrl = eas.build?.base?.env?.EXPO_PUBLIC_API_URL;
if (easBackendUrl !== releaseBackendUrl) {
  failures.push(
    `EAS backend URL differs from release ledger: eas=${JSON.stringify(easBackendUrl)}, release=${JSON.stringify(releaseBackendUrl)}`,
  );
}
// Supabase погашен 2026-09-08: ни один профиль сборки не должен тащить его
// адрес или ключ — иначе они снова окажутся внутри приложения.
for (const [profile, config] of Object.entries(eas.build ?? {})) {
  for (const key of Object.keys(config?.env ?? {})) {
    if (key.startsWith("EXPO_PUBLIC_SUPABASE_")) {
      failures.push(`eas.json ${profile}: ${key} больше не используется — удалите`);
    }
  }
}
for (const profile of ["development", "preview"]) {
  if (
    eas.build?.[profile]?.env?.EXPO_PUBLIC_ENABLE_DEMO !== "true" ||
    eas.build?.[profile]?.env?.EXPO_PUBLIC_DEMO_MODE !== "true"
  ) {
    failures.push(`eas.json ${profile} profile must explicitly enable preview demo flags`);
  }
}
if (
  eas.build?.production?.env?.EXPO_PUBLIC_ENABLE_DEMO !== "false" ||
  eas.build?.production?.env?.EXPO_PUBLIC_DEMO_MODE !== "false"
) {
  failures.push("eas.json production profile must explicitly disable both demo flags");
}
if (!app.expo?.ios?.associatedDomains?.includes("applinks:xtrud.pro")) {
  failures.push("app.json must include the production applinks:xtrud.pro entitlement");
}
if (app.expo?.android?.permissions?.includes("android.permission.RECORD_AUDIO")) {
  failures.push("Android RECORD_AUDIO is forbidden until the product has an audio feature");
}
const uniqueVersions = new Set(Object.values(versions));
if (uniqueVersions.size !== 1 || uniqueVersions.has(undefined)) {
  failures.push(
    `versions differ: ${Object.entries(versions)
      .map(([source, version]) => `${source}=${JSON.stringify(version)}`)
      .join(", ")}`,
  );
}

// npm also repeats the project version at package-lock's top level. It is not
// an EAS input, but keeping it aligned prevents misleading lockfile metadata.
if (packageLock.version !== packageLock.packages?.[""]?.version) {
  failures.push(
    `package-lock.json version=${JSON.stringify(packageLock.version)} differs from root version=${JSON.stringify(packageLock.packages?.[""]?.version)}`,
  );
}

// Сборка одной платформы не должна спотыкаться о номер соседней: номер iOS
// «уже загружен» ровно до следующего подъёма, а Android-сборке это не мешает.
// --platform android|ios сужает только проверки номера сборки; общие
// (версии, backend URL, demo-флаги, appVersionSource) выполняются всегда.
const platformIndex = process.argv.indexOf("--platform");
const platformScope = platformIndex >= 0 ? process.argv[platformIndex + 1] : "all";
if (!["all", "ios", "android"].includes(platformScope)) {
  failures.push("--platform принимает только ios или android");
}
const checkIos = platformScope !== "android";
const checkAndroid = platformScope !== "ios";

const iosBuildNumber = app.expo?.ios?.buildNumber;
if (checkIos && !/^[1-9]\d*$/.test(String(iosBuildNumber ?? ""))) {
  failures.push(
    `app.json expo.ios.buildNumber must be a positive integer string, received ${JSON.stringify(iosBuildNumber)}`,
  );
}

const iosBuild = Number(iosBuildNumber);
const publishedIosBuild = release.stores?.ios?.latestPublishedBuildNumber;
const publishedIosVersion = release.stores?.ios?.latestPublishedVersion;
if (!checkIos) {
  // Android-сборка: номер iOS не проверяем.
} else if (!Number.isInteger(publishedIosBuild) || publishedIosBuild < 1 || !publishedIosVersion) {
  failures.push("release/production.json должен содержать опубликованные iOS version/build");
} else {
  const marketingComparison = compareMarketingVersions(app.expo?.version, publishedIosVersion);
  if (marketingComparison === null) {
    failures.push(
      `iOS marketing version должна иметь 1-3 числовых компонента: current=${JSON.stringify(app.expo?.version)}, published=${JSON.stringify(publishedIosVersion)}`,
    );
  } else if (marketingComparison < 0) {
    failures.push(
      `iOS marketing version ${app.expo?.version} меньше опубликованной ${publishedIosVersion}`,
    );
  }
  if (iosBuild === publishedIosBuild && app.expo?.version !== publishedIosVersion) {
    failures.push(
      `iOS build ${iosBuild} уже опубликован с version=${publishedIosVersion}, получено ${app.expo?.version}`,
    );
  }
}

// App Store Connect отвергает повторную загрузку пары version+build, даже если
// сборка лежит только в TestFlight. Логика и её тесты — в version-utils.mjs.
if (checkIos) {
  failures.push(
    ...checkIosBuildNumber({
      build: iosBuild,
      published: publishedIosBuild,
      uploaded: release.stores?.ios?.latestUploadedBuildNumber,
    }),
  );
}

const androidVersionCode = app.expo?.android?.versionCode;
if (checkAndroid && (!Number.isInteger(androidVersionCode) || androidVersionCode < 1)) {
  failures.push(
    `app.json expo.android.versionCode must be a positive integer, received ${JSON.stringify(androidVersionCode)}`,
  );
}
const publishedAndroidCode = release.stores?.android?.latestPublishedVersionCode;
if (checkAndroid && publishedAndroidCode !== null && androidVersionCode < publishedAndroidCode) {
  failures.push(
    `Android versionCode ${androidVersionCode} меньше опубликованного ${publishedAndroidCode}`,
  );
}

if (eas.cli?.appVersionSource !== "local") {
  failures.push(
    `eas.json cli.appVersionSource must be "local", received ${JSON.stringify(eas.cli?.appVersionSource)}`,
  );
}
if (eas.build?.production?.autoIncrement !== false) {
  failures.push("eas.json production.autoIncrement должен быть false: номера задаются в Git");
}

const storeReleaseIndex = process.argv.indexOf("--store-release");
if (storeReleaseIndex >= 0) {
  const platform = process.argv[storeReleaseIndex + 1];
  if (platform === "ios" && iosBuild <= publishedIosBuild) {
    failures.push(
      `Новый iOS release требует buildNumber > ${publishedIosBuild}; сначала обнови app.json и release ledger после публикации`,
    );
  } else if (
    platform === "android" &&
    publishedAndroidCode !== null &&
    androidVersionCode <= publishedAndroidCode
  ) {
    failures.push(
      `Новый Android release требует versionCode > ${publishedAndroidCode}; сначала обнови app.json`,
    );
  } else if (platform !== "ios" && platform !== "android") {
    failures.push("--store-release принимает только ios или android");
  }
}

if (failures.length > 0) {
  console.error("\nVersion consistency gate failed:\n");
  failures.forEach((failure) => {
    console.error(`  - ${failure}`);
  });
  console.error();
  process.exit(1);
}

console.log(
  `Version consistency gate passed: version=${app.expo.version}, ios.buildNumber=${iosBuildNumber}, android.versionCode=${androidVersionCode}, EAS source=local.`,
);
