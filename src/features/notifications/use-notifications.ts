/**
 * Уведомления пользователя — список и отметка о прочтении.
 * DECISION владельца 2026-09-07: «нет экрана, где показаны последние
 * уведомления и что происходит». Источник — таблица notifications (RLS:
 * только свои строки), realtime уже инвалидирует ключ (use-realtime-notifications).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";
import { notificationTargetFromData } from "./notification-target";

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
 * (`verification_*` — видны на экране уведомлений, к заказам не относятся),
 * и отзывы (`review_received` — бейдж «Специалистов»).
 *
 * `kind` есть только у рассылки новых заданий. Условие «kind ≠ new_order»
 * в SQL отбрасывает строки, где kind нет вовсе, — так бейдж с 2026-09-07 не
 * считал ни одного события (FACT 2026-09-11: 4 непрочитанных, счётчик 0).
 * Поэтому «kind пуст или не new_order». Тип события лежит в
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
        .neq("type", "review_received")
        .or("data->>kind.is.null,data->>kind.neq.new_order")
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
        .neq("type", "review_received")
        .or("data->>kind.is.null,data->>kind.neq.new_order")
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
      qc.invalidateQueries({ queryKey: unreadReviewsKey(userId) });
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
    },
  });
}

/**
 * Новые отзывы мне — бейдж «Специалистов» и строка «Отзывы» в «Я
 * специалист» (владелец, 2026-09-11: «получил отзыв и нигде не увидел»).
 * Гаснет, когда человек открыл свой профиль или экран «Уведомления».
 */
export const unreadReviewsKey = (userId: string | undefined) =>
  ["notifications", "unread-reviews", userId] as const;

export function useUnreadReviewsCount(userId: string | undefined) {
  return useQuery<number>({
    queryKey: unreadReviewsKey(userId),
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "review_received")
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Открыл свой профиль — новые отзывы увидены. */
export function useMarkReviewsSeen(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("type", "review_received")
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unreadReviewsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
    },
  });
}

/** Куда ведёт строка уведомления — то же правило, что у нажатия на push. */
export function notificationTarget(n: AppNotification): string | null {
  return notificationTargetFromData(n.data as Record<string, unknown> | null, n.user_id);
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
