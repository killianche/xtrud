// Конфигурация из переменных окружения. Секреты — только на сервере
// (/opt/xtrud/xtrud-api.env), в Git не попадают.
import { z } from "zod";

/**
 * Идентификаторы Apple — ровно десять символов [A-Z0-9]. Проверка нужна не
 * ради красоты: сюда легко попадает placeholder из шаблона, и тогда Apple
 * молча отвечает 403 на каждое уведомление. Пусть лучше не стартует сервер.
 */
function appleId(name: string) {
  return z.string().regex(/^[A-Z0-9]{10}$/, `${name}: ожидается 10 символов A-Z0-9, а не заглушка`);
}

const schema = z.object({
  PORT: z.coerce.number().default(8100),
  DATABASE_URL: z.string().url(),
  /** Тот же секрет, что у GoTrue: старые и новые токены взаимозаменяемы. */
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default("xtrud-api"),
  ACCESS_TTL_SECONDS: z.coerce.number().default(3600),
  REFRESH_TTL_DAYS: z.coerce.number().default(60),
  /** Домен синтетической почты для аккаунтов по телефону (как в приложении). */
  PHONE_EMAIL_DOMAIN: z.string().default("phone.xtrud.pro"),
  POSTGREST_URL: z.string().url().default("http://supabase-rest:3000"),
  FILES_ROOT: z.string().default("/data/files"),
  FILES_PUBLIC_BASE: z.string().url().default("https://api.xtrud.pro/files"),
  /**
   * Push через APNs. Настройка целиком необязательна — без неё сервер
   * работает, а уведомления остаются только внутри приложения. Но если задана
   * часть, дальше идти нельзя: молча слать «в никуда» хуже, чем не стартовать.
   */
  APNS_KEY_PATH: z.string().optional(),
  APNS_KEY_ID: appleId("APNS_KEY_ID").optional(),
  APNS_TEAM_ID: appleId("APNS_TEAM_ID").optional(),
  APNS_TOPIC: z.string().min(1).default("com.xtrud.app"),
  /** Общий секрет, которым база подписывает вызов /v2/internal/push. */
  NOTIFY_SECRET: z.string().min(16).optional(),
  /**
   * Объектное хранилище S3. Как и push, настройка необязательна: без неё
   * файлы лежат на диске сервера. Половинчатая настройка отвергается —
   * иначе загрузка молча ушла бы не туда.
   */
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY: z.string().min(16).optional(),
  S3_SECRET_KEY: z.string().min(16).optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Некорректная конфигурация: ${issues}`);
  }
  const cfg = parsed.data;
  const apnsParts = [cfg.APNS_KEY_PATH, cfg.APNS_KEY_ID, cfg.APNS_TEAM_ID];
  const filled = apnsParts.filter((v) => v !== undefined).length;
  if (filled > 0 && filled < apnsParts.length) {
    throw new Error(
      "Некорректная конфигурация: APNs задан наполовину — нужны APNS_KEY_PATH, APNS_KEY_ID и APNS_TEAM_ID вместе",
    );
  }
  if (filled === apnsParts.length && cfg.NOTIFY_SECRET === undefined) {
    throw new Error(
      "Некорректная конфигурация: с APNs обязателен NOTIFY_SECRET — иначе отправку push мог бы вызвать кто угодно",
    );
  }
  const s3Parts = [
    cfg.S3_ENDPOINT,
    cfg.S3_REGION,
    cfg.S3_BUCKET,
    cfg.S3_ACCESS_KEY,
    cfg.S3_SECRET_KEY,
  ];
  const s3Filled = s3Parts.filter((v) => v !== undefined).length;
  if (s3Filled > 0 && s3Filled < s3Parts.length) {
    throw new Error(
      "Некорректная конфигурация: хранилище задано наполовину — нужны S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY вместе",
    );
  }
  return cfg;
}

/** Настроено ли объектное хранилище целиком. */
export function s3Configured(cfg: Config): boolean {
  return (
    cfg.S3_ENDPOINT !== undefined &&
    cfg.S3_REGION !== undefined &&
    cfg.S3_BUCKET !== undefined &&
    cfg.S3_ACCESS_KEY !== undefined &&
    cfg.S3_SECRET_KEY !== undefined
  );
}

/** Настроен ли push целиком. Частичная настройка отвергается выше. */
export function apnsConfigured(cfg: Config): boolean {
  return (
    cfg.APNS_KEY_PATH !== undefined &&
    cfg.APNS_KEY_ID !== undefined &&
    cfg.APNS_TEAM_ID !== undefined &&
    cfg.NOTIFY_SECRET !== undefined
  );
}
