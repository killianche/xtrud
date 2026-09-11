/**
 * Нажатие на push открывает то, о чём оно: задание или свой профиль с
 * отзывами. Раньше обработчика не было вовсе — приложение открывалось там,
 * где его закрыли (владелец, 2026-09-11: «получил отзыв и нигде не увидел»).
 *
 * `useLastNotificationResponse` покрывает и холодный запуск из уведомления,
 * и нажатие при открытом приложении. Переходим, когда известно, кто вошёл,
 * и корневая навигация уже смонтирована, — раньше router бросает ошибку.
 */

import * as Notifications from "expo-notifications";
import { useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { mergePushData, notificationTargetFromData } from "./notification-target";

export function useNotificationTapNavigation(
  userId: string | null | undefined,
  authReady: boolean,
): void {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || !authReady || !navReady) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const request = response.notification.request;
    if (handled.current === request.identifier) return;
    handled.current = request.identifier;
    // Иначе то же нажатие сработает снова при следующем запуске.
    Notifications.clearLastNotificationResponse();

    const trigger = request.trigger as { payload?: unknown } | null;
    const target = notificationTargetFromData(
      mergePushData(request.content.data, trigger?.payload),
      userId,
    );
    if (target) router.push(target as never);
  }, [response, authReady, navReady, userId, router]);
}
