/**
 * Цифра на иконке приложения = непрочитанные уведомления.
 *
 * Сервер ставит её вместе с push (badge = непрочитанные на момент отправки),
 * но потом её никто не сбрасывал: человек всё прочитал, а на иконке висит «1»
 * (владелец, 2026-09-13). Теперь приложение само выставляет цифру каждый раз,
 * когда счётчик меняется, и обнуляет её при выходе из аккаунта.
 */

import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useUnreadNotificationsCount } from "./use-notifications";

export function useAppIconBadge(userId: string | null | undefined): void {
  const { data: unread, isSuccess } = useUnreadNotificationsCount(userId ?? undefined);
  const count = userId ? (isSuccess ? (unread ?? 0) : null) : 0;

  useEffect(() => {
    // Пока счётчик не загрузился, цифру не трогаем — иначе мигнёт ноль.
    if (count === null || Platform.OS === "web") return;
    void Notifications.setBadgeCountAsync(count).catch(() => {
      // Нет разрешения на значки — не ошибка для человека.
    });
  }, [count]);
}
