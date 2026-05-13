// Metro config with NativeWind v4 + SVG-as-component поддержкой.
// SVG: импорты *.svg возвращают React-компонент (через react-native-svg-transformer)
//   — можно красить через prop `color` / fill="currentColor".
// Источник: https://github.com/kristerkari/react-native-svg-transformer
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// SVG → React-компонент.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== "svg"),
  sourceExts: [...config.resolver.sourceExts, "svg"],
};

module.exports = withNativeWind(config, { input: "./global.css" });
