/**
 * Регистрация Expo push-токена на сервере.
 *
 * Sprint 8.6:
 * - При первом запуске после login получает Expo push token и upsert'ит
 *   его в `notification_tokens` (UNIQUE on expo_token).
 * - На web — silent skip (Expo не поддерживает push на web Expo Go).
 * - При signOut handler удаляет токен (отдельный hook ниже).
 *
 * Запрос разрешения происходит лениво — только при наличии userId, чтобы
 * не дёргать систему до login.
 */

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export function useRegisterPushToken(userId: string | null | undefined) {
  const lastRegisteredForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      lastRegisteredForUser.current = null;
      return;
    }
    if (lastRegisteredForUser.current === userId) return;

    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS === "web") return; // Expo Push на web не поддерживается.
        if (!Device.isDevice) return; // На симуляторе Expo Push не работает.

        // Permission
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const ask = await Notifications.requestPermissionsAsync();
          status = ask.status;
        }
        if (status !== "granted") return;

        // Android: канал по умолчанию для звука
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "По умолчанию",
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: "default",
          });
        }

        // EAS projectId зашит через app config; expo-notifications извлекает сам.
        const tokenRes = await Notifications.getExpoPushTokenAsync();
        const expoToken = tokenRes.data;
        if (!expoToken || cancelled) return;

        const platform =
          Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
        const deviceName = `${Device.brand ?? ""} ${Device.modelName ?? ""}`.trim().slice(0, 100);

        // UNIQUE(expo_token) — re-upsert обновит user_id если устройство
        // перешло другому юзеру (logout+login на одном телефоне).
        const { error } = await supabase.from("notification_tokens").upsert(
          {
            user_id: userId,
            expo_token: expoToken,
            platform,
            device_name: deviceName || null,
          },
          { onConflict: "expo_token" },
        );
        if (error) {
          console.warn("[push] не удалось сохранить токен:", error.message);
          return;
        }
        lastRegisteredForUser.current = userId;
      } catch (e) {
        console.warn("[push] ошибка регистрации токена:", (e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}

/**
 * Удаление push-токена этого устройства при signOut.
 * Вызывается из lib/auth.signOut().
 */
export async function unregisterCurrentPushToken(): Promise<void> {
  try {
    if (Platform.OS === "web" || !Device.isDevice) return;
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== "granted") return;
    const tokenRes = await Notifications.getExpoPushTokenAsync();
    const expoToken = tokenRes.data;
    if (!expoToken) return;
    await supabase.from("notification_tokens").delete().eq("expo_token", expoToken);
  } catch {
    // тихо — это cleanup, не критично
  }
}
