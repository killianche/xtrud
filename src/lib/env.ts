// Типобезопасный доступ к public env-переменным с runtime-валидацией через Zod.
//
// Все переменные с префиксом EXPO_PUBLIC_* инлайнятся Expo в bundle на этапе сборки.
// Используем Zod чтобы не упасть в проде на undefined и быстро поймать опечатки.
//
// Service role и прочие секреты — НЕ в этом файле и НЕ с EXPO_PUBLIC_*. Они живут
// в GitHub Secrets / EAS Secrets для server-side окружений (edge functions, CI).

import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z
    .string({ message: "EXPO_PUBLIC_SUPABASE_URL не задан" })
    .url({ message: "EXPO_PUBLIC_SUPABASE_URL должен быть валидным URL" }),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ message: "EXPO_PUBLIC_SUPABASE_ANON_KEY не задан" })
    .min(20, { message: "EXPO_PUBLIC_SUPABASE_ANON_KEY слишком короткий" }),
  // Ключ проекта Sentry (отслеживание сбоев). Необязателен: если не задан —
  // Sentry просто выключен (см. src/lib/sentry.ts). Не валидируем как .url(),
  // чтобы кривое значение не роняло старт — Sentry сам проверит DSN.
  EXPO_PUBLIC_SENTRY_DSN: z.string().optional(),
});

// process.env замещается Metro/Expo на этапе сборки;
// нечего не использует именованную деструктуризацию (она ломает inlining).
const parsed = envSchema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(
    `Неверная конфигурация env:\n${issues}\n\n` +
      "Скопируй .env.example в .env.local и заполни значения из Supabase Dashboard.\n" +
      "Перезапусти dev-сервер: переменные читаются только на старте бандлера.",
  );
}

export const env = parsed.data;
