/**
 * Регистрация Expo push-токена на сервере.
 *
 * Sprint 8.6:
 * - При первом запуске после login получает Expo push token и upsert'ит
 *   его в `notification_tokens` (UNIQUE on expo_token).
 * - На web — полный no-op (не импортируем expo-notifications вообще, чтобы не
 *   ломать гидрацию web bundle).
 *
 * Запрос разрешения происходит лениво — только при наличии userId.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export function useRegisterPushToken(userId: string | null | undefined) {
  const lastRegisteredForUser = useRef<string | null>(null);

  useEffect(() => {
    // На web — полный no-op (даже не импортируем нативные модули).
    if (Platform.OS === "web") return;

    if (!userId) {
      lastRegisteredForUser.current = null;
      return;
    }
    if (lastRegisteredForUser.current === userId) return;

    let cancelled = false;

    (async () => {
      try {
        // Динамические импорты — НЕ попадают в web bundle.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Device = require("expo-device");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Notifications = require("expo-notifications");

        if (!Device.isDevice) return; // На симуляторе Expo Push не работает.

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const ask = await Notifications.requestPermissionsAsync();
          status = ask.status;
        }
        if (status !== "granted") return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "По умолчанию",
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: "default",
          });
        }

        const tokenRes = await Notifications.getExpoPushTokenAsync();
        const expoToken = tokenRes.data;
        if (!expoToken || cancelled) return;

        const platform = Platform.OS === "ios" ? "ios" : "android";
        const deviceName = `${Device.brand ?? ""} ${Device.modelName ?? ""}`.trim().slice(0, 100);

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
        console.warn("[push] ошибка регистрации:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
