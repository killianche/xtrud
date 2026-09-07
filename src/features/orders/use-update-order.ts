// Mutation: владелец редактирует заказ.
// RLS orders_update_own разрешает UPDATE только при auth.uid()=client_id.
// На уровне БД status не ограничен — но в UI экран edit показываем только при
// status='open' (после принятия отклика заказ заморожен по бизнес-логике).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { digitsOnly, normalizePhone } from "@/features/auth/validation";
import { ALL_INGUSHETIA_CITY } from "@/features/orders/order-schema";
import { myOrdersKey } from "@/features/orders/use-my-orders";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

/** Номер в хранимом виде (+7XXXXXXXXXX) или NULL, если поле пустое. */
function toStoredPhone(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  return digitsOnly(value).length >= 10 ? normalizePhone(value) : null;
}

export interface UpdateOrderInput {
  orderId: string;
  clientId: string;
  l2Id: string;
  title: string;
  /** Необязательное контактное имя (мастер видит его вместо профиля заказчика).
   *  Пусто → NULL. */
  contactName?: string;
  /** Телефон/WhatsApp для связи по заданию — по желанию. Пусто → NULL. */
  contactPhone?: string;
  whatsappPhone?: string;
  /** Способ связи (0168). По умолчанию — отклики в приложении. */
  contactMode?: "chat_only" | "phone_open";
  description: string;
  cityId: string;
  district: string;
  urgency: Database["public"]["Enums"]["order_urgency"];
  /** Способ задания бюджета (fixed/from/up_to/negotiable). */
  budgetKind: Database["public"]["Enums"]["order_price_kind"];
  /** Одно числовое значение в ₽. NULL для negotiable. */
  budgetValue: number | null;
  /** Точная дата (yyyy-mm-dd) для urgency='by_date'. NULL для остальных. */
  preferredDate?: string | null;
  /**
   * Итоговый список URL фото (обложка = индекс 0). Уже включает и оставленные
   * старые фото, и публичные URL только что загруженных новых — экран edit
   * собирает его перед вызовом (см. app/(details)/orders/edit/[id].tsx). Если
   * undefined — поле photo_urls в БД не трогаем (back-compat).
   */
  photoUrls?: string[];
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      // Те же правила нормализации, что и в use-create-order:
      //  - description пустая → NULL (миграция 0090);
      //  - city_id = NULL когда «Вся Ингушетия» или выбран только район;
      //  - budget_value = NULL для negotiable.
      const trimmedDesc = input.description?.trim() ?? "";
      const trimmedName = input.contactName?.trim() ?? "";
      const payload: Database["public"]["Tables"]["orders"]["Update"] = {
        l2_id: input.l2Id,
        title: input.title,
        contact_name: trimmedName.length === 0 ? null : trimmedName,
        // Отклики в приложении — номеров в задании нет (0168: они не
        // показываются, хранить незачем). Напрямую — хотя бы один номер.
        contact_mode: input.contactMode ?? "chat_only",
        contact_phone:
          (input.contactMode ?? "chat_only") === "phone_open"
            ? toStoredPhone(input.contactPhone)
            : null,
        whatsapp_phone:
          (input.contactMode ?? "chat_only") === "phone_open"
            ? toStoredPhone(input.whatsappPhone)
            : null,
        description: trimmedDesc.length === 0 ? null : trimmedDesc,
        city_id: input.cityId === ALL_INGUSHETIA_CITY || !input.cityId ? null : input.cityId,
        district: input.district || null,
        urgency: input.urgency,
        preferred_date: input.urgency === "by_date" ? (input.preferredDate ?? null) : null,
        budget_kind: input.budgetKind,
        budget_value: input.budgetKind === "negotiable" ? null : input.budgetValue,
      };
      // photo_urls трогаем только если экран его передал (edit с фото-блоком).
      if (input.photoUrls !== undefined) {
        payload.photo_urls = input.photoUrls;
      }
      const { error } = await supabase.from("orders").update(payload).eq("id", input.orderId);
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, clientId }) => {
      queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myOrdersKey(clientId) });
    },
  });
}
