/**
 * Живые обновления счётчиков и списков — опрос вместо realtime-канала
 * Supabase (docs/BACKEND_REWRITE_PLAN.md, этап 4: позже SSE /v2/events).
 *
 * Пока приложение активно, раз в 20 секунд обновляются уведомления, бейджи
 * откликов и ленты. Запросы — count под RLS, они уже есть у экранов.
 * Возврат в приложение обновляет всё сразу через focusManager
 * (app/_layout.tsx).
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import {
  notificationsKey,
  unreadNotificationsKey,
  unreadOrderEventsKey,
} from "@/features/notifications/use-notifications";
import { unreadFeedKey, unreadResponsesKey } from "@/features/orders/unread-feed-helpers";
import { myOrdersKey } from "@/features/orders/use-my-orders";

const POLL_MS = 20_000;

export function useRealtimeNotifications(opts: {
  userId: string | null | undefined;
  /** Категории специалиста — ключ счётчика непрочитанных заданий. */
  l2Ids: string[];
}) {
  const qc = useQueryClient();
  const l2Key = opts.l2Ids.join(",");
  useEffect(() => {
    const userId = opts.userId;
    if (!userId) return;
    const l2Ids = l2Key ? l2Key.split(",") : [];
    const tick = () => {
      if (AppState.currentState !== "active") return;
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadOrderEventsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadResponsesKey(userId) });
      qc.invalidateQueries({ queryKey: myOrdersKey(userId) });
      if (l2Ids.length > 0) qc.invalidateQueries({ queryKey: unreadFeedKey(userId, l2Ids) });
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [opts.userId, l2Key, qc]);
}
