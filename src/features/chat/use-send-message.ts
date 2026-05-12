// Mutation: отправка сообщения в чат.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatMessagesKey } from "@/features/chat/use-chat-messages";
import { myChatsKey } from "@/features/chat/use-my-chats";
import { supabase } from "@/lib/supabase";

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  text: string;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, senderId, text }: SendMessageInput) => {
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: senderId,
        text,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { chatId, senderId }) => {
      // Realtime сам прокинет в кэш chat-messages, но для надёжности:
      queryClient.invalidateQueries({ queryKey: chatMessagesKey(chatId) });
      queryClient.invalidateQueries({ queryKey: myChatsKey(senderId) });
    },
  });
}
