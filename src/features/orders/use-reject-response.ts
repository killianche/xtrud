// useRejectResponse — клиент скрывает отклик мастера (status='rejected').
// Через RPC reject_response (SECURITY DEFINER + проверка прав).
// Используется на master response card в order detail: меню → «Скрыть».

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface RejectResponseInput {
  responseId: string;
  /** Order id — для инвалидации кэша order-responses. */
  orderId: string;
}

export function useRejectResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ responseId }: RejectResponseInput): Promise<void> => {
      const { error } = await supabase.rpc("reject_response", {
        p_response_id: responseId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["order-responses", vars.orderId] });
    },
  });
}
