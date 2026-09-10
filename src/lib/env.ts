// Типобезопасный доступ к public env-переменным с runtime-валидацией через Zod.
//
// Все переменные с префиксом EXPO_PUBLIC_* инлайнятся Expo в bundle на этапе сборки.
// Используем Zod чтобы не упасть в проде на undefined и быстро поймать опечатки.
//
// Секреты — НЕ в этом файле и НЕ с EXPO_PUBLIC_*: всё, что сюда попадает,
// оказывается внутри приложения у каждого пользователя.

import { z } from "zod";

const envSchema = z.object({
  // Адрес нашего сервера xtrud-api (release/production.json → backend.url).
  // До 2026-09-10 назывался EXPO_PUBLIC_SUPABASE_URL, а рядом лежал публичный
  // ключ Supabase. Наш сервер ключ не спрашивает — он удалён вместе с Supabase.
  EXPO_PUBLIC_API_URL: z
    .string({ message: "EXPO_PUBLIC_API_URL не задан" })
    .url({ message: "EXPO_PUBLIC_API_URL должен быть валидным URL" }),
  // Ключ проекта Sentry (отслеживание сбоев). Необязателен: если не задан —
  // Sentry просто выключен (см. src/lib/sentry.ts). Не валидируем как .url(),
  // чтобы кривое значение не роняло старт — Sentry сам проверит DSN.
  EXPO_PUBLIC_SENTRY_DSN: z.string().optional(),
});

// process.env замещается Metro/Expo на этапе сборки;
// нечего не использует именованную деструктуризацию (она ломает inlining).
const parsed = envSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(
    `Неверная конфигурация env:\n${issues}\n\n` +
      "Задай EXPO_PUBLIC_API_URL в .env.local — адрес из release/production.json → backend.url.\n" +
      "Перезапусти dev-сервер: переменные читаются только на старте бандлера.",
  );
}

export const env = parsed.data;
