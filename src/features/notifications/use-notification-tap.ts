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
import { RUSTORE_ON_OPENED, rustorePush } from "./rustore-push";

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

/**
 * То же самое для Android: там уведомление доставляет и показывает RuStore,
 * и `expo-notifications` о нажатии ничего не знает.
 *
 * Два входа: приложение запустили нажатием (`getInitialNotification`) и
 * нажали, когда оно уже работало (событие `ON_OPENED`). Оба ведут в ту же
 * функцию адреса, что и iOS, — правило перехода одно на обе платформы.
 */
export function useRuStoreNotificationTapNavigation(
  userId: string | null | undefined,
  authReady: boolean,
): void {
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;
  const handledInitial = useRef(false);

  useEffect(() => {
    const binding = rustorePush();
    if (binding === null || !authReady || !navReady) return;

    const open = (data: Record<string, unknown> | undefined) => {
      const target = notificationTargetFromData(data, userId);
      if (target) router.push(target as never);
    };

    // Без этого вызова SDK не шлёт события в JS.
    binding.client.createPushEmitter();
    const subscription = binding.events.addListener(RUSTORE_ON_OPENED, (message) => {
      open(message?.data);
    });

    // Холодный запуск из уведомления — один раз за жизнь приложения.
    if (!handledInitial.current) {
      handledInitial.current = true;
      void binding.client
        .getInitialNotification()
        .then((message) => open(message?.data ?? undefined))
        .catch(() => {
          // Нет начального уведомления — обычный запуск.
        });
    }

    return () => subscription.remove();
  }, [authReady, navReady, userId, router]);
}
