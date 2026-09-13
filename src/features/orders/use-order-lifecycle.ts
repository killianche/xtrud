/**
 * Жизненный цикл задания (0196, владелец 2026-09-13):
 *   открыто → «Выбрать исполнителем» → исполнитель выбран
 *           → «Работа выполнена» → завершено (можно оставить отзыв)
 *   исполнитель выбран → «Отказаться от исполнителя» → снова открыто.
 *
 * Все переходы — функции базы с проверкой прав и статуса (SECURITY DEFINER):
 * клиентский UPDATE тут не годится, нужно атомарно поменять отклик, задание
 * и разослать уведомления.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { orderPublishCapacityKey } from "@/features/orders/use-order-publish-capacity";
import { supabase } from "@/lib/supabase";

function useInvalidateOrder() {
  const qc = useQueryClient();
  return (orderId: string, clientId: string) => {
    qc.invalidateQueries({ queryKey: orderDetailKey(orderId) });
    qc.invalidateQueries({ queryKey: ["order-responses", orderId] });
    qc.invalidateQueries({ queryKey: myOrdersKey(clientId) });
    qc.invalidateQueries({ queryKey: orderPublishCapacityKey(clientId) });
    qc.invalidateQueries({ queryKey: ["reviewable-order"] });
  };
}

export function usePickOrderMaster() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: async (input: { orderId: string; responseId: string; clientId: string }) => {
      const { error } = await supabase.rpc("pick_order_master", {
        p_order_id: input.orderId,
        p_response_id: input.responseId,
      });
      if (error) throw error;
    },
    onSettled: (_d, _e, { orderId, clientId }) => invalidate(orderId, clientId),
  });
}

export function useUnpickOrderMaster() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: async (input: { orderId: string; clientId: string }) => {
      const { error } = await supabase.rpc("unpick_order_master", { p_order_id: input.orderId });
      if (error) throw error;
    },
    onSettled: (_d, _e, { orderId, clientId }) => invalidate(orderId, clientId),
  });
}

export function useCompleteOrder() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: async (input: { orderId: string; clientId: string }) => {
      const { error } = await supabase.rpc("complete_order", { p_order_id: input.orderId });
      if (error) throw error;
    },
    onSettled: (_d, _e, { orderId, clientId }) => invalidate(orderId, clientId),
  });
}
