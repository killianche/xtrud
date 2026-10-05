/**
 * Expo config plugin: сжатие и оптимизация кода Android (R8) в release.
 *
 * Google Play (2026-10-05, Release dashboard) пометил сборку 1.0.4 (6):
 * «DEX code optimization is below our threshold — Obfuscation 1%», срок —
 * февраль 2027. Шаблон Expo включает R8 свойством
 * `android.enableMinifyInReleaseBuilds` в gradle.properties
 * (android/app/build.gradle шаблона: `minifyEnabled enableMinifyInReleaseBuilds`).
 * Каталог `android/` генерируется, поэтому свойство ставит этот плагин.
 *
 * Сжатие ресурсов (`enableShrinkResourcesInReleaseBuilds`) намеренно не
 * включено: библиотеки ищут часть ресурсов по имени (иконка уведомления и
 * т.п.), и шринкер может их удалить — Google просит оптимизацию кода, а не
 * ресурсов.
 */

const { withGradleProperties } = require("expo/config-plugins");

const PROPERTIES = { "android.enableMinifyInReleaseBuilds": "true" };

const withAndroidMinify = (config) =>
  withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = cfg.modResults.find((item) => item.type === "property" && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: "property", key, value });
    }
    return cfg;
  });

module.exports = withAndroidMinify;
