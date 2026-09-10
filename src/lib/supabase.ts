// Клиент данных xtrud — один singleton на всё приложение.
//
// С 2026-09-08 это НЕ supabase-js, а свой клиент к xtrud-api на Beget
// (src/lib/xtrud-client): вход, таблицы через PostgREST, функции базы,
// файлы. Имя модуля и интерфейс (`supabase.from / rpc / auth / storage`)
// сохранены, чтобы 46 файлов приложения не менялись — см.
// docs/BACKEND_REWRITE_PLAN.md.
//
// Сессия хранится в защищённом хранилище (largeSecureStorage); старая
// сессия supabase-js переезжает автоматически (обмен refresh-токена).
// AppState: фоновое обновление токена только пока приложение активно.

import "react-native-url-polyfill/auto";

import { AppState, Platform } from "react-native";
import { env } from "./env";
import { createTimeoutFetch } from "./fetch-with-timeout";
import { largeSecureStorage } from "./storage";
import { createXtrudClient } from "./xtrud-client/client";

export type { ApiError, Session, SessionUser } from "./xtrud-client/types";

export const supabase = createXtrudClient({
  baseUrl: env.EXPO_PUBLIC_API_URL,
  storage: largeSecureStorage,
  // Таймаут на КАЖДЫЙ запрос: молчащая сеть не должна оставлять экран в
  // вечной загрузке — см. src/lib/fetch-with-timeout.ts.
  fetch: createTimeoutFetch(),
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  supabase.auth.startAutoRefresh();
}
