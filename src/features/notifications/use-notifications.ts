/**
 * Hooks для Notification Center (Sprint I.1).
 *
 * - useNotifications — список всех своих уведомлений (по created_at DESC).
 * - useUnreadNotificationsCount — счётчик для bell-badge.
 * - useMarkNotificationsRead — RPC, помечает прочитанным (один/все).
 * - useDeleteNotification — soft delete (DELETE на своей строке через RLS).
 * - useRealtimeNotifications — подписка на INSERT для live-обновления.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Notification = Tables<"notifications">;

export function notificationsKey(userId: string | undefined) {
  return ["notifications", userId] as const;
}

export function unreadNotificationsKey(userId: string | undefined) {
  return ["unread-notifications", userId] as const;
}

const PAGE_SIZE = 50;

export function useNotifications(userId: string | null | undefined) {
  return useQuery<Notification[]>({
    queryKey: notificationsKey(userId ?? undefined),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}

export function useUnreadNotificationsCount(userId: string | null | undefined) {
  return useQuery<number>({
    queryKey: unreadNotificationsKey(userId ?? undefined),
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
    staleTime: 15_000,
  });
}

export function useMarkNotificationsRead(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[] | null) => {
      const { error } = await supabase.rpc("mark_notifications_read", {
        p_ids: ids ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
    },
  });
}

export function useDeleteNotification(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationsKey(userId) });
      qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
    },
  });
}

/**
 * Реалтайм-подписка. При INSERT инвалидируем оба ключа — count и список.
 * При UPDATE (mark read) — то же самое (на случай, если read'нули с другого устройства).
 */
export function useRealtimeNotifications(userId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: notificationsKey(userId) });
          qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: notificationsKey(userId) });
          qc.invalidateQueries({ queryKey: unreadNotificationsKey(userId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
