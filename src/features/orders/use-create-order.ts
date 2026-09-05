// Mutation: создать заказ клиентом.
// RLS orders_insert_own проверит auth.uid() = client_id.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { digitsOnly, normalizePhone } from "@/features/auth/validation";
import {
  ActiveOrderLimitError,
  getOrderPublishCapacity,
} from "@/features/orders/order-publish-capacity";
import { ALL_INGUSHETIA_CITY } from "@/features/orders/order-schema";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import {
  fetchActiveOrderCount,
  orderPublishCapacityKey,
} from "@/features/orders/use-order-publish-capacity";
import { supabase } from "@/lib/supabase";
import type { Database, Enums } from "@/types/database";

/** Номер в хранимом виде (+7XXXXXXXXXX) или NULL, если поле пустое. */
function toStoredPhone(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  return digitsOnly(value).length >= 10 ? normalizePhone(value) : null;
}

export type OrderUrgency = Enums<"order_urgency">;
/** Тип цены — fixed | from | up_to | negotiable. Заменил OrderBudgetMode
 *  с устаревшим диапазоном (миграция 0068). */
export type OrderPriceKind = Enums<"order_price_kind">;

export interface CreateOrderInput {
  clientId: string;
  l2Id: string;
  title: string;
  /** Необязательное контактное имя, которое мастер увидит в заказе вместо
   *  профиля заказчика. Пусто → NULL → покажем регистрационное имя. */
  contactName?: string;
  /** Телефон/WhatsApp для связи по заданию — по желанию. Пусто → NULL. */
  contactPhone?: string;
  whatsappPhone?: string;
  description: string;
  cityId: string;
  district: string;
  urgency: OrderUrgency;
  /** Способ задания бюджета (fixed/from/up_to/negotiable). */
  budgetKind: OrderPriceKind;
  /** Одно числовое значение в ₽. NULL для negotiable. */
  budgetValue: number | null;
  /** Точная дата (yyyy-mm-dd) для urgency='by_date'. NULL для остальных. */
  preferredDate?: string | null;
  /** Публичные URL фото заказа (до 5, обложка = [0]). Пусто = без фото. */
  photoUrls?: string[];
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<{ id: string }> => {
      // UX precheck directly before insert. It closes the ordinary app path,
      // but is intentionally not presented as authoritative: two devices can
      // still race until the reviewed backend quota trigger/RPC is deployed.
      const capacity = getOrderPublishCapacity(await fetchActiveOrderCount(input.clientId));
      if (!capacity.canPublish) throw new ActiveOrderLimitError(capacity.limit);

      // Description опционально (UI помечен «необязательно»). Если пустая
      // строка — отправляем NULL вместо "" (миграция 0089 разрешает NULL и
      // снимает min length=10).
      const trimmedDesc = input.description?.trim() ?? "";
      const trimmedName = input.contactName?.trim() ?? "";
      const payload: Database["public"]["Tables"]["orders"]["Insert"] = {
        client_id: input.clientId,
        l2_id: input.l2Id,
        title: input.title,
        // Пустое имя → NULL (при просмотре заказа покажем регистрационное).
        contact_name: trimmedName.length === 0 ? null : trimmedName,
        contact_phone: toStoredPhone(input.contactPhone),
        whatsapp_phone: toStoredPhone(input.whatsappPhone),
        description: trimmedDesc.length === 0 ? null : trimmedDesc,
        // city_id = NULL когда:
        //   - выбрана «Вся Ингушетия» (миграция 0045 сделала city_id nullable);
        //   - выбран район без города (LocationPicker позволяет «либо город,
        //     либо район» — territориальный фильтр по district).
        city_id: input.cityId === ALL_INGUSHETIA_CITY || !input.cityId ? null : input.cityId,
        district: input.district || null,
        urgency: input.urgency,
        // Дата только для «к дате», иначе NULL (даже если что-то прилетело).
        preferred_date: input.urgency === "by_date" ? (input.preferredDate ?? null) : null,
        budget_kind: input.budgetKind,
        budget_value: input.budgetKind === "negotiable" ? null : input.budgetValue,
        photo_urls: input.photoUrls && input.photoUrls.length > 0 ? input.photoUrls : [],
        status: "open",
      };
      const { data, error } = await supabase.from("orders").insert(payload).select("id").single();
      if (error) throw error;
      return { id: data.id };
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: myOrdersKey(clientId) });
      queryClient.invalidateQueries({ queryKey: orderPublishCapacityKey(clientId) });
    },
  });
}
