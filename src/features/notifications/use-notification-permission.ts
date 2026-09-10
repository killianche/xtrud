/**
 * Разрешение на уведомления для экрана аккаунта: показать «Уведомления
 * выключены» и отвести туда, где их можно включить.
 *
 * Состояние перечитывается, когда приложение возвращается на экран: человек
 * мог только что включить уведомления в настройках iPhone — строка должна
 * исчезнуть сама, без перезапуска.
 */

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { type PushPermissionState, pushPermissionState } from "./push-permission-state";

export function useNotificationPermission() {
  const [state, setState] = useState<PushPermissionState>("unavailable");

  const refresh = useCallback(async () => {
    // На симуляторе push нет — предлагать включить нечего.
    if (!Device.isDevice) {
      setState("unavailable");
      return;
    }
    try {
      setState(pushPermissionState(await Notifications.getPermissionsAsync()));
    } catch {
      setState("unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  /** Системный вопрос — только пока iOS разрешает его задать. */
  const request = useCallback(async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } finally {
      await refresh();
    }
  }, [refresh]);

  return { state, request };
}

/** Настройки xtrud в iPhone — единственное место, где снимается запрет. */
export function openNotificationSettings(): void {
  void Linking.openSettings();
}
