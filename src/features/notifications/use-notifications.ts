/**
 * Уведомления пользователя — список и отметка о прочтении.
 * DECISION владельца 2026-09-07: «нет экрана, где показаны последние
 * уведомления и что происходит». Источник — таблица notifications (RLS:
 * только свои строки), realtime уже инвалидирует ключ (use-realtime-notifications).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type AppNotification = Tables<"notifications">;

export const notificationsKey = (userId: string | undefined) => ["notifications", userId] as const;
export const unreadNotificationsKey = (userId: string | undefined) =>
  ["notifications-unread", userId] as const;

const PAGE = 50;

export function useNotifications(userId: string | undefined) {
  return useQuery<AppNotification[]>({
    queryKey: notificationsKey(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, type, title, body, data, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useUnreadNotificationsCount(userId: string | undefined) {
  return useQuery<number>({
    queryKey: unreadNotificationsKey(userId),
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * События по моим заказам для бейджа «Мои задания»: принят/отменён/закрыт
 * заказ, отозван отклик, ожидание подтверждения и т.п. Не считаем
 * `new_response` (он уже в счётчике откликов) и рассылку новых заданий
 * (`data.kind = new_order`, это бейдж «Найти задание») и решения по паспорту
 * (`verification_*` — видны на экране уведомлений, к заказам не относятся). Тип события лежит в
 * `data.type` — колонка `type` для неизвестных значений становится `system`
 * (FACT: `notify_user` в базе, 2026-09-07).
 */
export const unreadOrderEventsKey = (userId: string | undefined) =>
  ["notifications", "unread-order-events", userId] as const;

export function useUnreadOrderEventsCount(userId: string | undefined) {
  return useQuery<number>({
    queryKey: unreadOrderEventsKey(userId),
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null)
        .neq("data->>type", "new_response")
        .not("data->>kind", "eq", "new_order")
        .not("data->>type", "like", "verification_%");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Открыли «Мои задания» — события по заказам прочитаны, бейдж гаснет. */
export function useMarkOrderEventsRead(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null)
        .neq("data->>type", "new_response")
        .not("data->>kind", "eq", "new_order")
        .not("data->>type", "like", "verification_%");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unreadOrderEventsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
    },
  });
}

/** Отметить все непрочитанные прочитанными — при открытии экрана. */
export function useMarkNotificationsRead(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
    },
  });
}

/** Куда ведёт уведомление: задание, если оно указано в data. */
export function notificationTarget(n: AppNotification): string | null {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const orderId = typeof data.order_id === "string" ? data.order_id : null;
  return orderId ? `/orders/${orderId}` : null;
}

export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    "ru-RU",
    sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" },
  ).format(d);
}
