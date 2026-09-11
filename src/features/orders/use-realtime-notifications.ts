/**
 * Живые обновления счётчиков и списков.
 *
 * Основной путь — поток SSE /v2/events (docs/BACKEND_REWRITE_PLAN.md, этап 4):
 * база сообщает о новом уведомлении (0189), сервер — этому человеку, и
 * приложение сразу обновляет уведомления, бейджи откликов, отзывов и ленты.
 * Раньше — только опрос раз в 20 секунд.
 *
 * Опрос остался запасным путём: он молчит, пока канал присылает сигналы
 * (сервер шлёт «жив» раз в 25 с), и включается, если канал пропал. Канал
 * держится, только пока приложение на экране; в фоне закрывается.
 * Возврат в приложение обновляет всё сразу через focusManager
 * (app/_layout.tsx).
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  notificationsKey,
  unreadNotificationsKey,
  unreadOrderEventsKey,
  unreadReviewsKey,
} from "@/features/notifications/use-notifications";
import { unreadFeedKey, unreadResponsesKey } from "@/features/orders/unread-feed-helpers";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { env } from "@/lib/env";
import { openSse } from "@/lib/sse";
import { supabase } from "@/lib/supabase";

const POLL_MS = 20_000;
/** Канал считается живым, пока от него что-то приходило за это время. */
const LIVE_FRESH_MS = 60_000;
/** Паузы перед переподключением: быстро после обрыва, реже при повторах. */
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];

export function useRealtimeNotifications(opts: {
  userId: string | null | undefined;
  /** Категории специалиста — ключ счётчика непрочитанных заданий. */
  l2Ids: string[];
}) {
  const qc = useQueryClient();
  const l2Key = opts.l2Ids.join(",");
  const lastLiveAt = useRef(0);
  useEffect(() => {
    const userId = opts.userId;
    if (!userId) return;
    const l2Ids = l2Key ? l2Key.split(",") : [];

    const refreshAll = () => {
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadOrderEventsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadReviewsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadResponsesKey(userId) });
      qc.invalidateQueries({ queryKey: myOrdersKey(userId) });
      if (l2Ids.length > 0) qc.invalidateQueries({ queryKey: unreadFeedKey(userId, l2Ids) });
    };

    // Запасной опрос: не нужен, пока живой канал присылает сигналы.
    const tick = () => {
      if (AppState.currentState !== "active") return;
      if (Date.now() - lastLiveAt.current < LIVE_FRESH_MS) return;
      refreshAll();
    };
    const timer = setInterval(tick, POLL_MS);

    let close: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    let hadConnection = false;

    const schedule = () => {
      if (disposed || retry || AppState.currentState !== "active") return;
      const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] ?? 30_000;
      attempt += 1;
      retry = setTimeout(() => {
        retry = null;
        void connect();
      }, wait);
    };

    const connect = async () => {
      if (disposed || close || AppState.currentState !== "active") return;
      const token = await supabase.auth.accessToken();
      if (disposed || close || !token) return;
      close = openSse({
        url: `${env.EXPO_PUBLIC_API_URL.replace(/\/+$/, "")}/v2/events`,
        token,
        onActivity: () => {
          lastLiveAt.current = Date.now();
          attempt = 0;
        },
        onFrame: (frame) => {
          if (frame.event === "notification") refreshAll();
          // После обрыва сигналы могли потеряться — догоняем одним заходом.
          if (frame.event === "ready" && hadConnection) refreshAll();
          if (frame.event === "ready") hadConnection = true;
        },
        onClose: () => {
          close = null;
          lastLiveAt.current = 0;
          schedule();
        },
      });
    };

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") {
        void connect();
        return;
      }
      close?.();
      close = null;
      lastLiveAt.current = 0;
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
    };

    void connect();
    const sub = AppState.addEventListener("change", onAppState);
    return () => {
      disposed = true;
      clearInterval(timer);
      sub.remove();
      close?.();
      if (retry) clearTimeout(retry);
      lastLiveAt.current = 0;
    };
  }, [opts.userId, l2Key, qc]);
}
