import assert from "node:assert/strict";
import test from "node:test";

import { validateMobileConfig } from "./check-mobile-config.mjs";

function fixture(mutate = () => {}) {
  const config = {
    scheme: "xtrud",
    userInterfaceStyle: "automatic",
    ios: { bundleIdentifier: "com.xtrud.app", infoPlist: {} },
    android: {
      package: "com.xtrud.app",
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
    },
    plugins: [["expo-image-picker", { microphonePermission: false }]],
    _internal: {
      modResults: {
        android: {
          manifest: {
            manifest: {
              "uses-permission": [
                {
                  $: {
                    "android:name": "android.permission.RECORD_AUDIO",
                    "tools:node": "remove",
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
  const eas = {
    build: {
      production: {
        env: {
          EXPO_PUBLIC_DEMO_MODE: "false",
          EXPO_PUBLIC_ENABLE_DEMO: "false",
        },
        ios: {},
        android: { buildType: "app-bundle" },
      },
    },
  };
  mutate(config, eas);
  return { config, eas };
}

test("mobile config accepts both application IDs and microphone removal markers", () => {
  const { config, eas } = fixture();
  assert.deepEqual(validateMobileConfig(config, eas), {
    androidApplicationId: "com.xtrud.app",
    androidRecordAudio: false,
    iosApplicationId: "com.xtrud.app",
    iosMicrophoneUsage: false,
  });
});

test("mobile config rejects active or misleading microphone permissions", () => {
  const cases = [
    (config) => {
      config.plugins[0][1].microphonePermission = "Allow microphone";
    },
    (config) => {
      config.android.blockedPermissions = [];
    },
    (config) => {
      config._internal.modResults.android.manifest.manifest["uses-permission"][0].$["tools:node"] =
        undefined;
    },
    (config) => {
      config.ios.infoPlist.NSMicrophoneUsageDescription = "Allow microphone";
    },
  ];
  for (const mutate of cases) {
    const { config, eas } = fixture(mutate);
    assert.throws(() => validateMobileConfig(config, eas), /microphone|RECORD_AUDIO/u);
  }
});

test("mobile config fails closed when native introspection output is missing", () => {
  const cases = [
    (config) => {
      delete config._internal;
    },
    (config) => {
      delete config._internal.modResults.android.manifest.manifest["uses-permission"];
    },
    (config) => {
      delete config.ios.infoPlist;
    },
  ];
  for (const mutate of cases) {
    const { config, eas } = fixture(mutate);
    assert.throws(() => validateMobileConfig(config, eas), /introspection/u);
  }
});

test("mobile config rejects identifier, theme and production-profile drift", () => {
  const cases = [
    (config) => {
      config.ios.bundleIdentifier = "com.example.ios";
    },
    (config) => {
      config.android.package = "com.example.android";
    },
    (config) => {
      config.userInterfaceStyle = "light";
    },
    (_config, eas) => {
      eas.build.production.android.buildType = "apk";
    },
    (_config, eas) => {
      eas.build.production.env.EXPO_PUBLIC_DEMO_MODE = "true";
    },
  ];
  for (const mutate of cases) {
    const { config, eas } = fixture(mutate);
    assert.throws(() => validateMobileConfig(config, eas));
  }
});
