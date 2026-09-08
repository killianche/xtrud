/**
 * Регистрация устройства для push.
 *
 * Токен берём родной, от Apple (`getDevicePushTokenAsync`), а не токен Expo:
 * отправляет уведомления наш сервер напрямую в APNs, сервис Expo Push в
 * цепочке не участвует и данные пользователя туда не уходят.
 *
 * Разрешение спрашиваем не при запуске, а после входа: системный запрос
 * показывается один раз за установку, и человек должен понимать, за что его
 * спрашивают. Отказ — нормальный исход: уведомления останутся на экране
 * «Уведомления» внутри приложения.
 */

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

/**
 * Окружение APNs у токена своё: сборка из TestFlight и App Store общается с
 * production, отладочная — с sandbox. Сервер обязан слать туда же, откуда
 * токен получен, иначе Apple ответит «чужой токен».
 */
const APNS_ENVIRONMENT = __DEV__ ? "sandbox" : "production";

/** Показывать уведомление, даже когда приложение открыто. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function currentDeviceToken(): Promise<string | null> {
  // Симулятор токен не выдаёт — на нём push проверить нельзя, и это не ошибка.
  if (!Device.isDevice) return null;
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return null;
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === "string" && token.data.length > 0 ? token.data : null;
}

export function useRegisterPushToken(userId: string | null | undefined): void {
  // Один заход на пользователя: повторная регистрация того же токена ничего
  // не меняет, а лишний системный запрос раздражает.
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || doneFor.current === userId) return;
    let cancelled = false;
    doneFor.current = userId;

    void (async () => {
      try {
        const token = await currentDeviceToken();
        if (cancelled || token === null) return;
        // Токен уникален: тот же телефон у другого аккаунта должен
        // переехать на нового владельца, а не задвоиться.
        const { error } = await supabase.from("notification_tokens").upsert(
          {
            user_id: userId,
            device_token: token,
            platform: Platform.OS === "ios" ? "ios" : "android",
            environment: APNS_ENVIRONMENT,
            device_name: Device.deviceName?.slice(0, 100) ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "device_token" },
        );
        if (error) throw error;
      } catch {
        // Push — не критический путь: молча остаёмся без него, экран
        // «Уведомления» продолжает работать. Повтор — при следующем входе.
        doneFor.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}

/**
 * Снять токен при выходе: иначе следующему владельцу телефона придут чужие
 * уведомления. Ошибку глушим — выход не должен зависеть от сети.
 */
export async function unregisterCurrentPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return;
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data !== "string" || token.data.length === 0) return;
    await supabase.from("notification_tokens").delete().eq("device_token", token.data);
  } catch {
    // выход важнее, чем снятие токена
  }
}
