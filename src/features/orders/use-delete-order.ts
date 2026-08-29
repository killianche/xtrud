// Mutation: владелец удаляет свой заказ из «Истории» (cancelled / expired).
//
// USAGE: подключён в app/(details)/orders/[id].tsx (action-меню «Удалить»),
// доступно только когда заказ cancelled / expired (статусы «Истории»).
//
// 2026-05-21 (план ORDER_LIFECYCLE_CLIENT_PLAN.md §4 «Удалить заказ»):
// открытый заказ удалить нельзя — сначала «Закрыть». Это защита от случайного
// стирания активной заявки с откликами (паттерн Avito/Profi). RLS-политика
// orders_owner_delete_history (миграция 0099) пропускает DELETE только для
// своих cancelled/expired заказов. FK ON DELETE CASCADE на order_responses
// каскадно удаляет связанные отклики.
//
// Удаление физическое (hard delete) — консистентно с уже существующими
// DELETE-политиками (orders_owner_delete_open, orders_delete_own_drafts).
// Мягкое удаление (флаг скрытия) — возможное улучшение на будущее, требует
// колонку deleted_at + фильтрацию во всех читающих хуках; пока избыточно.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";

export interface DeleteOrderInput {
  orderId: string;
  /** Client user id — для инвалидации списка «Мои заказы». */
  clientId: string;
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId }: DeleteOrderInput) => {
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, clientId }) => {
      // Заказ удалён — убираем его detail-кэш и обновляем список.
      queryClient.removeQueries({ queryKey: orderDetailKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myOrdersKey(clientId) });
    },
  });
}
