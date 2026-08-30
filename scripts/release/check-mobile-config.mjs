#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedApplicationId = "com.xtrud.app";

function imagePickerOptions(plugins = []) {
  const entry = plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker",
  );
  return entry?.[1] ?? null;
}

export function validateMobileConfig(config, easConfig) {
  const errors = [];
  if (config.ios?.bundleIdentifier !== expectedApplicationId) {
    errors.push(`ios.bundleIdentifier must be ${expectedApplicationId}`);
  }
  if (config.android?.package !== expectedApplicationId) {
    errors.push(`android.package must be ${expectedApplicationId}`);
  }
  if (config.scheme !== "xtrud") errors.push("scheme must remain xtrud");
  if (config.userInterfaceStyle !== "automatic") {
    errors.push("userInterfaceStyle must remain automatic");
  }

  const picker = imagePickerOptions(config.plugins);
  if (picker?.microphonePermission !== false) {
    errors.push("expo-image-picker microphonePermission must be false");
  }
  if (!config.android?.blockedPermissions?.includes("android.permission.RECORD_AUDIO")) {
    errors.push("android.blockedPermissions must remove RECORD_AUDIO");
  }

  const manifestPermissions =
    config._internal?.modResults?.android?.manifest?.manifest?.["uses-permission"];
  if (!Array.isArray(manifestPermissions)) {
    errors.push("Expo introspection did not produce Android manifest permissions");
  }
  const activeRecordAudio = (manifestPermissions ?? []).some(
    (permission) =>
      permission?.$?.["android:name"] === "android.permission.RECORD_AUDIO" &&
      permission?.$?.["tools:node"] !== "remove",
  );
  if (activeRecordAudio) errors.push("final Android manifest actively requests RECORD_AUDIO");
  if (!config.ios?.infoPlist || typeof config.ios.infoPlist !== "object") {
    errors.push("Expo introspection did not produce iOS Info.plist");
  } else if (Object.hasOwn(config.ios.infoPlist, "NSMicrophoneUsageDescription")) {
    errors.push("final iOS Info.plist contains an unused microphone permission");
  }

  const production = easConfig.build?.production;
  if (!production?.ios || production?.android?.buildType !== "app-bundle") {
    errors.push("EAS production must define iOS and Android app-bundle profiles");
  }
  if (
    production?.env?.EXPO_PUBLIC_ENABLE_DEMO !== "false" ||
    production?.env?.EXPO_PUBLIC_DEMO_MODE !== "false"
  ) {
    errors.push("EAS production demo flags must both be false");
  }

  if (errors.length) throw new Error(errors.join("; "));
  return {
    androidApplicationId: config.android.package,
    androidRecordAudio: false,
    iosApplicationId: config.ios.bundleIdentifier,
    iosMicrophoneUsage: false,
  };
}

export function readIntrospectedConfig() {
  const expo = resolve(root, "node_modules/.bin/expo");
  const output = execFileSync(expo, ["config", "--type", "introspect", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = validateMobileConfig(
      readIntrospectedConfig(),
      JSON.parse(readFileSync(resolve(root, "eas.json"), "utf8")),
    );
    console.log(
      `Mobile config passed: ios=${result.iosApplicationId}, android=${result.androidApplicationId}, microphone=false.`,
    );
  } catch (error) {
    console.error(`Mobile config FAILED: ${error.message}`);
    process.exit(1);
  }
}
