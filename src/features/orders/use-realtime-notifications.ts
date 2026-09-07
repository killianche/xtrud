// Живые обновления — одна личная подписка на notifications.
//
// FACT (разбор 2026-09-06): подписки на orders и order_responses «без
// фильтра» а) будили бы каждого вошедшего на каждое чужое событие —
// O(события × клиенты), б) на деле не получали ничего: в публикации
// supabase_realtime не было ни одной таблицы. С миграции 0164 в публикации
// одна таблица — notifications, и подписка фильтруется по user_id: человека
// будят только его события. Строку в notifications пишут те же триггеры, что
// шлют push (notify_user), поэтому источник событий один и тот же.
//
// На событие мы не перерисовываем ничего сами — только помечаем нужные
// запросы устаревшими; react-query перезапросит их, когда экран на виду.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  notificationsKey,
  unreadNotificationsKey,
  unreadOrderEventsKey,
} from "@/features/notifications/use-notifications";
import { unreadFeedKey, unreadResponsesKey } from "@/features/orders/unread-feed-helpers";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { orderResponsesKey } from "@/features/orders/use-order-responses";
import { uniqueRealtimeTopic } from "@/lib/realtime-topic";
import { supabase } from "@/lib/supabase";

interface NotificationRow {
  type: string;
  data: { kind?: string; order_id?: string } | null;
}

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
    let channel: RealtimeChannel;
    try {
      channel = supabase
        .channel(uniqueRealtimeTopic(`notifications:${userId}`))
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // Экран «Уведомления» и счётчик непрочитанных — на любое событие.
            qc.invalidateQueries({ queryKey: notificationsKey(userId) });
            qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
            qc.invalidateQueries({ queryKey: unreadOrderEventsKey(userId) });
            const row = payload.new as NotificationRow;
            const orderId = row.data?.order_id;
            if (row.type === "new_response") {
              qc.invalidateQueries({ queryKey: unreadResponsesKey(userId) });
              qc.invalidateQueries({ queryKey: myOrdersKey(userId) });
              if (orderId) {
                qc.invalidateQueries({ queryKey: orderDetailKey(orderId) });
                qc.invalidateQueries({ queryKey: orderResponsesKey(orderId) });
              }
              return;
            }
            if (row.data?.kind === "new_order" && l2Ids.length > 0) {
              qc.invalidateQueries({ queryKey: unreadFeedKey(userId, l2Ids) });
              qc.invalidateQueries({ queryKey: ["all-open-orders"] });
            }
          },
        )
        .subscribe();
    } catch (e) {
      // Живые обновления — удобство, не работа приложения: без них счётчики
      // обновятся по staleTime и при следующем открытии экрана.
      console.warn("[realtime] подписка на уведомления не создана:", e);
      return;
    }
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [opts.userId, l2Key, qc]);
}
