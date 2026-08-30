// Hook: список заявок, на которые мастер откликнулся.
// Возвращает orders с JOIN на L2/city + статус собственного отклика.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export interface MyResponseWithOrder {
  response: Tables<"order_responses">;
  order: Tables<"orders"> & {
    l2: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon"> | null;
    city: Pick<Tables<"cities">, "id" | "name"> | null;
  };
}

export function myResponsesKey(userId: string | undefined) {
  return ["my-responses", userId] as const;
}

/**
 * Активный отклик = клиент ещё может выбрать мастера (заказ открыт, отклик живой).
 *
 * Отклик НЕ активен (= уходит в «Историю откликов») если:
 *   - заказ в терминальном/закрытом статусе (completed / cancelled / expired /
 *     disputed / awaiting_confirmation), ИЛИ
 *   - сам отклик отклонён / отозван (rejected / withdrawn).
 * `in_progress` считается активным (поведение совпадает с лентой «Ваши отклики»).
 *
 * Единый источник истины — используют и MasterDashboardOrders (показывает
 * активные), и экран /orders/responses-history (показывает инверсию). Не
 * дублировать предикат копипастой (правило connect-the-dots.md).
 */
export function isActiveResponse(r: MyResponseWithOrder): boolean {
  const orderStatus = r.order.status;
  const respStatus = r.response.status;
  if (
    orderStatus === "completed" ||
    orderStatus === "cancelled" ||
    orderStatus === "expired" ||
    orderStatus === "disputed" ||
    orderStatus === "awaiting_confirmation"
  ) {
    return false;
  }
  if (respStatus === "rejected" || respStatus === "withdrawn") {
    return false;
  }
  return true;
}

/** Инверсия isActiveResponse — отклик попал в «Историю» (закрытый/завершённый). */
export function isHistoryResponse(r: MyResponseWithOrder): boolean {
  return !isActiveResponse(r);
}

/**
 * Человекочитаемый статус «мёртвого» отклика для бейджа в Истории.
 *
 * Приоритет: СНАЧАЛА терминальный статус ЗАКАЗА, потом статус отклика. Важно:
 * когда клиент закрывает / просрочивает заказ, триггер БД авто-переводит отклики
 * мастера в `withdrawn`. Если бы приоритет был у статуса отклика, мы бы написали
 * «Отозван» (будто мастер сам отозвал) — это вводит в заблуждение. Поэтому
 * «Заказ закрыли» / «Истёк» / «Завершён» (что случилось с заказом) важнее.
 * Статус отклика (rejected/withdrawn) показываем только если заказ ещё активен
 * (open/in_progress) — тогда причина действительно в самом отклике.
 */
export function historyResponseStatusLabel(r: MyResponseWithOrder): string {
  switch (r.order.status) {
    case "completed":
      return "Завершён";
    case "cancelled":
      return "Заказ закрыли";
    case "expired":
      return "Истёк";
    case "disputed":
      return "Спор";
    case "awaiting_confirmation":
      return "На подтверждении";
    default:
      break;
  }
  // Заказ ещё активен (open/in_progress) → причина в самом отклике.
  if (r.response.status === "rejected") return "Отклонён";
  if (r.response.status === "withdrawn") return "Отозван";
  return "Закрыт";
}

export function useMyResponses(userId: string | undefined) {
  return useQuery<MyResponseWithOrder[]>({
    queryKey: myResponsesKey(userId),
    queryFn: async () => {
      if (!userId) return [];
      // Fetch responses + JOINs на orders + L2 + city за один запрос
      const { data, error } = await supabase
        .from("order_responses")
        .select(
          "*, order:orders!order_responses_order_id_fkey(*, l2:categories_l2(id, name_ru, icon), city:cities(id, name))",
        )
        .eq("master_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Биом будет ругаться на any; формируем тип строго.
      type Row = Tables<"order_responses"> & {
        order: MyResponseWithOrder["order"] | null;
      };
      const rows = (data ?? []) as unknown as Row[];

      return rows
        .filter((r): r is Row & { order: NonNullable<Row["order"]> } => r.order !== null)
        .map((r) => ({
          response: {
            id: r.id,
            order_id: r.order_id,
            master_id: r.master_id,
            l2_id: r.l2_id,
            price_kind: r.price_kind,
            price_value: r.price_value,
            lead_time: r.lead_time,
            message: r.message,
            status: r.status,
            created_at: r.created_at,
            updated_at: r.updated_at,
          },
          order: r.order,
        }));
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
