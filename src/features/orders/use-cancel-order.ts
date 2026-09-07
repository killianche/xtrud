// Mutation: владелец закрывает заказ (UPDATE status='cancelled').
//
// RLS orders_owner_change_status_in_progress / orders_owner_edit_open
// разрешают переход open → cancelled (auth.uid()=client_id).
//
// 2026-05-21 (план ORDER_LIFECYCLE_CLIENT_PLAN.md §4): при закрытии заказа
// клиент выбирает причину — «нашёл мастера» (успех) или «больше не нужно»
// (передумал). Причину пишем в orders.cancel_reason (колонка уже есть в БД,
// миграция 0072), плюс cancelled_by = клиент. Это даёт честную статистику
// «сколько заказов закрылись успехом» и в будущем — отзывы только по
// «нашёл мастера». Технически оба исхода ведут в один статус cancelled.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { orderPublishCapacityKey } from "@/features/orders/use-order-publish-capacity";
import { supabase } from "@/lib/supabase";

/** Машинная причина закрытия заказа клиентом. Хранится в orders.cancel_reason. */
export type CancelReason = "found_master" | "no_longer_needed";

export interface CancelOrderInput {
  orderId: string;
  clientId: string;
  /** Причина закрытия. Опционально для обратной совместимости со старыми
   *  вызовами (CloseOrderHint без выбора причины), но UI всегда передаёт. */
  reason?: CancelReason;
  /** Р1 (DECISION владельца 2026-09-07): при «нашёл исполнителя» — кто из
   *  откликнувшихся сделал работу. Мастер получает уведомление (0175). */
  pickedMasterId?: string | null;
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, clientId, reason, pickedMasterId }: CancelOrderInput) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          // Пишем причину только если она передана — не затираем существующую
          // (например, авто-причину от ночной задачи) пустым значением.
          ...(reason ? { cancel_reason: reason, cancelled_by: clientId } : {}),
          ...(reason === "found_master" && pickedMasterId
            ? { picked_master_id: pickedMasterId, picked_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, clientId }) => {
      queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myOrdersKey(clientId) });
      queryClient.invalidateQueries({ queryKey: orderPublishCapacityKey(clientId) });
    },
  });
}
