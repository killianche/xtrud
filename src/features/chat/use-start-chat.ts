// useStartChatWithMaster — вызывает RPC start_chat_with_master.
// Идемпотентно: возвращает существующий chat_id если он уже создан,
// иначе создаёт новый (по паре order_id + master_id).
//
// Используется на master-response-card в order detail: кнопка «Написать»
// → RPC → router.push(`/chats/${chatId}`). Это позволяет клиенту задать
// вопрос мастеру ДО выбора (раньше chat создавался только в accept_response).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myChatsKey } from "@/features/chat/use-my-chats";
import { supabase } from "@/lib/supabase";

export interface StartChatInput {
  orderId: string;
  masterId: string;
  /** Опционально — userId клиента для инвалидации `my-chats` кэша. */
  clientUserId?: string | undefined;
}

export function useStartChatWithMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartChatInput): Promise<string> => {
      const { data, error } = await supabase.rpc("start_chat_with_master", {
        p_order_id: input.orderId,
        p_master_id: input.masterId,
      });
      if (error) throw error;
      if (!data) throw new Error("Сервер не вернул chat_id");
      return data as string;
    },
    onSuccess: (_chatId, vars) => {
      qc.invalidateQueries({ queryKey: myChatsKey(vars.clientUserId) });
    },
  });
}
