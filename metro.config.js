// Metro config with NativeWind v4 support.
// See https://www.nativewind.dev/docs/getting-started/installation
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
