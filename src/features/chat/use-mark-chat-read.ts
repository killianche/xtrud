/**
 * Mutation: пометить чат прочитанным для текущего пользователя.
 * RPC mark_chat_read проверяет участие через RLS UPDATE policy.
 *
 * Caller вызывает при первом монтировании chat thread.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myChatsKey } from "@/features/chat/use-my-chats";
import { supabase } from "@/lib/supabase";

export function useMarkChatRead(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase.rpc("mark_chat_read", { p_chat_id: chatId });
      if (error) throw error;
    },
    onSuccess: () => {
      // Обновляем cached my-chats — там last_read_*_at теперь свежий.
      queryClient.invalidateQueries({ queryKey: myChatsKey(userId) });
    },
  });
}
