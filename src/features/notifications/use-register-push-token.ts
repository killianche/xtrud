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
 * «Уведомления» внутри приложения, а в аккаунте появится строка «Уведомления
 * выключены» со ссылкой в настройки iPhone.
 *
 * Попытка повторяется каждый раз, когда приложение возвращается на экран, пока
 * токен не сохранён: человек мог включить уведомления в настройках. Раньше
 * была одна попытка за запуск — и тишина до перезапуска (2026-09-10).
 *
 * Сбои пишутся в client_errors (контекст push-register), а запрет — один раз
 * за запуск (push-permission): у тестировщика Юсуфа регистрация не случилась
 * ни разу, и увидеть причину было негде.
 */

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { reportClientError } from "@/lib/error-reporting";
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

type TokenResult =
  | { token: string }
  | { skipped: "simulator" | "undetermined" | "denied" | "empty" };

async function currentDeviceToken(ask: boolean): Promise<TokenResult> {
  // Симулятор токен не выдаёт — на нём push проверить нельзя, и это не ошибка.
  if (!Device.isDevice) return { skipped: "simulator" };
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain && ask) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return { skipped: existing.canAskAgain ? "undetermined" : "denied" };
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === "string" && token.data.length > 0
    ? { token: token.data }
    : { skipped: "empty" };
}

/** Запрет — это состояние, а не поток ошибок: один отчёт за запуск. */
let deniedReported = false;

/**
 * Одна попытка зарегистрировать телефон. Не бросает: push не должен ронять
 * приложение. `ask` — можно ли задать системный вопрос.
 * @returns true, если токен сохранён на сервере.
 */
export async function registerPushTokenNow(userId: string, ask: boolean): Promise<boolean> {
  try {
    const result = await currentDeviceToken(ask);
    if ("skipped" in result) {
      if (result.skipped === "denied" && !deniedReported) {
        deniedReported = true;
        reportClientError(new Error("push: уведомления запрещены в настройках iPhone"), {
          fatal: false,
          context: "push-permission",
        });
      }
      if (result.skipped === "empty") {
        reportClientError(new Error("push: Apple вернула пустой токен"), {
          fatal: false,
          context: "push-register",
        });
      }
      return false;
    }
    // Токен уникален: тот же телефон у другого аккаунта должен переехать на
    // нового владельца, а не задвоиться.
    const { error } = await supabase.from("notification_tokens").upsert(
      {
        user_id: userId,
        device_token: result.token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        environment: APNS_ENVIRONMENT,
        device_name: Device.deviceName?.slice(0, 100) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_token" },
    );
    if (error) throw error;
    return true;
  } catch (e) {
    reportClientError(e, { fatal: false, context: "push-register" });
    return false;
  }
}

export function useRegisterPushToken(userId: string | null | undefined): void {
  // Сохранили — больше не трогаем до смены пользователя.
  const doneFor = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const attempt = async (ask: boolean) => {
      if (doneFor.current === userId || inFlight.current) return;
      inFlight.current = true;
      const saved = await registerPushTokenNow(userId, ask);
      inFlight.current = false;
      if (!cancelled && saved) doneFor.current = userId;
    };

    // После входа — с системным вопросом (iOS покажет его один раз).
    void attempt(true);
    // Возврат в приложение — возможно, из настроек iPhone. Тихо, без вопроса.
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void attempt(false);
    });

    return () => {
      cancelled = true;
      sub.remove();
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
