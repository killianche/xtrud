// Supabase клиент для xtrud — один singleton на всё приложение.
//
// Платформы:
// - Web: storage через localStorage (передаём наш кросс-платформенный адаптер,
//   на web он использует window.localStorage). detectSessionInUrl=true для PKCE callback.
// - iOS/Android: storage через largeSecureStorage (SecureStore + чанкинг для больших session).
//   detectSessionInUrl=false (нет URL hash на мобиле).
//
// AppState listener: запускаем/останавливаем autoRefresh когда приложение в фоне/активно
// (рекомендация Supabase для Expo: иначе токены могут протухнуть в фоне).

import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import type { Database } from "@/types/database";
import { env } from "./env";
import { largeSecureStorage } from "./storage";

const isWeb = Platform.OS === "web";

export const supabase = createClient<Database>(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: largeSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
      flowType: "pkce",
    },
  },
);

// AppState-driven autoRefresh — для native. На web этот listener не нужен
// (браузер сам обрабатывает visibility) и AppState.addEventListener noop-ом
// возвращает subscription без активного триггера, но не вызываем для чистоты.
if (!isWeb) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
