/**
 * Expo config plugin: RuStore Push на Android.
 *
 * SDK читает идентификатор проекта из манифеста приложения — meta-data
 * `ru.rustore.sdk.pushclient.project_id` (проверено по исходникам
 * react-native-rustore-push 6.9.1 и его примеру). Каталоги `android/`
 * генерируются, руками их править нельзя (CROSS_PLATFORM_RULES §2), поэтому
 * значение подставляется этим плагином при prebuild.
 *
 * Идентификатор берётся из EXPO_PUBLIC_RUSTORE_PROJECT_ID. Его нет —
 * meta-data не добавляется вовсе: приложение собирается и работает, но push
 * на Android не регистрируется. Заглушку не подставляем: с чужим или
 * выдуманным идентификатором SDK молча не доставит ни одного уведомления,
 * и это выяснилось бы только на телефоне.
 *
 * Маven-репозиторий RuStore добавляет сам модуль SDK (его android/build.gradle
 * объявляет repositories для rootProject), поэтому здесь этого не требуется.
 */

const { withAndroidManifest } = require("expo/config-plugins");

const META_NAME = "ru.rustore.sdk.pushclient.project_id";

/** Значение из окружения сборки; пустая строка считается отсутствием. */
function projectIdFromEnv() {
  const raw = process.env.EXPO_PUBLIC_RUSTORE_PROJECT_ID;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

const withRuStorePush = (config) => {
  const projectId = projectIdFromEnv();
  if (projectId === null) return config;

  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("with-rustore-push: в манифесте нет <application>");
    }
    application["meta-data"] = application["meta-data"] ?? [];
    const existing = application["meta-data"].find(
      (item) => item.$?.["android:name"] === META_NAME,
    );
    if (existing) {
      existing.$["android:value"] = projectId;
    } else {
      application["meta-data"].push({
        $: { "android:name": META_NAME, "android:value": projectId },
      });
    }
    return cfg;
  });
};

module.exports = withRuStorePush;
