// Hook сообщений конкретного чата + Realtime subscription для live-обновления.
//
// Использование:
//   const { data: messages } = useChatMessages(chatId);
//   useRealtimeChatMessages(chatId);  // подписка на INSERT в messages

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type ChatMessage = Tables<"messages">;

export function chatMessagesKey(chatId: string | undefined) {
  return ["chat-messages", chatId] as const;
}

export function useChatMessages(chatId: string | undefined) {
  return useQuery<ChatMessage[]>({
    queryKey: chatMessagesKey(chatId),
    queryFn: async () => {
      if (!chatId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!chatId,
    staleTime: 0, // realtime обновляет — нужны свежие данные
  });
}

/**
 * Подписка на INSERT в messages через Supabase Realtime.
 * Невидимый hook — пробрасывает новые сообщения в TanStack Query cache.
 */
export function useRealtimeChatMessages(chatId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          // Добавляем новое сообщение в кэш напрямую (без рефетча)
          const newMessage = payload.new as ChatMessage;
          queryClient.setQueryData<ChatMessage[]>(chatMessagesKey(chatId), (old) => {
            if (!old) return [newMessage];
            // Dedup: если уже добавлено через optimistic update — игнорируем
            if (old.some((m) => m.id === newMessage.id)) return old;
            return [...old, newMessage];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);
}
