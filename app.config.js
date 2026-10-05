/**
 * Надстройка над app.json: только то, что нельзя держать в статическом файле.
 *
 * google-services.json (Firebase, push на Android через FCM) в Git не лежит —
 * он в .gitignore вместе с ключами. Сборка Android на GitHub Actions пишет его
 * из секрета во временный файл и передаёт путь в GOOGLE_SERVICES_JSON
 * (способ из документации Expo: file environment variable). Локально берётся
 * ./google-services.json, если он есть. Без файла Android собирается без FCM:
 * приложение работает, push на Android не приходят.
 */
const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (fs.existsSync(local) ? "./google-services.json" : undefined);
  if (googleServicesFile === undefined) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
