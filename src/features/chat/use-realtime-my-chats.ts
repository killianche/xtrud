/**
 * Realtime-подписка на UPDATE chats для текущего пользователя.
 *
 * Используется в `(tabs)/_layout` чтобы tab-badge «непрочитанные чаты»
 * обновлялся live, без необходимости открывать экран чатов.
 *
 * При любом UPDATE строки chats где client_id или master_id = userId →
 * invalidate myChatsKey. Это автоматически перетянет last_message_at +
 * last_read_*_at, и unreadChatsCount пересчитает badge.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { myChatsKey } from "@/features/chat/use-my-chats";
import { supabase } from "@/lib/supabase";

export function useRealtimeMyChats(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-chats:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chats" }, (payload) => {
        const row = payload.new as { client_id?: string; master_id?: string };
        if (row.client_id === userId || row.master_id === userId) {
          queryClient.invalidateQueries({ queryKey: myChatsKey(userId) });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chats" }, (payload) => {
        const row = payload.new as { client_id?: string; master_id?: string };
        if (row.client_id === userId || row.master_id === userId) {
          queryClient.invalidateQueries({ queryKey: myChatsKey(userId) });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
