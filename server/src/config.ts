// Конфигурация из переменных окружения. Секреты — только на сервере
// (/opt/xtrud/xtrud-api.env), в Git не попадают.
import { z } from "zod";

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
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Некорректная конфигурация: ${issues}`);
  }
  return parsed.data;
}
