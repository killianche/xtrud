// Hooks для откликов на заказ.
// 1. useOrderResponses — клиент видит все отклики на свой заказ.
// 2. useMyResponseForOrder — мастер проверяет, отправлял ли он отклик.
// 3. useSubmitResponse — мастер шлёт отклик.
//
// 2026-05-20: модель сменилась на «classifieds» — клиент звонит/пишет в WhatsApp
// напрямую по номеру мастера (см. /master/[id]). Сам номер живёт в auth.users
// и недоступен через RLS — карточка отклика подгружает phone через RPC
// `get_master_phone` (см. useMasterPhone), а whatsapp-поля — через
// `useMasterPublicProfile`. Здесь join только на public.users.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sortResponses } from "@/features/orders/sort-responses";
import { orderDetailKey } from "@/features/orders/use-order-detail";
import { supabase } from "@/lib/supabase";
import type { Database, Tables } from "@/types/database";

export interface OrderResponseWithMaster extends Tables<"order_responses"> {
  master:
    | (Pick<Tables<"users">, "id" | "first_name" | "last_name" | "avatar_url"> & {
        // Рейтинг мастера (общий, по всем категориям) — чтобы клиент сравнивал
        // мастеров в карточке отклика не только по цене. one-to-one → объект|null.
        profile: Pick<
          Tables<"master_profiles">,
          "rating_overall_avg" | "rating_overall_count"
        > | null;
      })
    | null;
}

export function orderResponsesKey(orderId: string | undefined) {
  return ["order-responses", orderId] as const;
}

export function useOrderResponses(orderId: string | undefined) {
  return useQuery<OrderResponseWithMaster[]>({
    queryKey: orderResponsesKey(orderId),
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("order_responses")
        .select(
          "*, master:users!order_responses_master_id_fkey(id, first_name, last_name, avatar_url, profile:master_profiles!master_profiles_user_id_fkey(rating_overall_avg, rating_overall_count))",
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return sortResponses((data ?? []) as OrderResponseWithMaster[]);
    },
    enabled: !!orderId,
    staleTime: 15_000,
  });
}

export function myResponseKey(orderId: string | undefined, userId: string | undefined) {
  return ["my-response", orderId, userId] as const;
}

export function useMyResponseForOrder(orderId: string | undefined, userId: string | undefined) {
  return useQuery<Tables<"order_responses"> | null>({
    queryKey: myResponseKey(orderId, userId),
    queryFn: async () => {
      if (!orderId || !userId) return null;
      const { data, error } = await supabase
        .from("order_responses")
        .select("*")
        .eq("order_id", orderId)
        .eq("master_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && !!userId,
    staleTime: 15_000,
  });
}

export interface SubmitResponseInput {
  orderId: string;
  masterId: string;
  l2Id: string;
  /** Способ задания цены (fixed/from/up_to/negotiable). */
  priceKind: Database["public"]["Enums"]["order_price_kind"];
  /** Одно числовое значение цены в ₽. NULL для negotiable. */
  priceValue: number | null;
  leadTime: string;
  message: string;
  /** Контакты, которые откликнувшийся оставил С ЭТИМ откликом. Хотя бы один
   *  обязателен — проверяется схемой формы и ограничением в базе (0147). */
  contactPhone: string | null;
  whatsappPhone: string | null;
  /** Отозванный отклик, который оживляем с новыми условиями (0172). */
  resendResponseId?: string;
}

export function useSubmitResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitResponseInput) => {
      // Один вызов: сервер сам смотрит, есть ли уже отклик, и вставляет
      // новый или оживляет отозванный (0181). Раньше это решал клиент по
      // своему запросу «есть ли мой отклик», и устаревший ответ приводил к
      // вставке поверх существующей строки: 409 и тупиковое «попробуйте ещё
      // раз», которое не могло сработать (разбор 2026-09-09).
      const { error } = await supabase.rpc("submit_order_response", {
        p_order_id: input.orderId,
        p_l2_id: input.l2Id,
        p_price_kind: input.priceKind,
        p_price_value: input.priceKind === "negotiable" ? null : input.priceValue,
        p_lead_time: input.leadTime || null,
        // Текст необязателен с 0146; пустую строку сервер сам превратит в NULL.
        p_message: input.message.trim() || null,
        p_contact_phone: input.contactPhone,
        p_whatsapp_phone: input.whatsappPhone,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { orderId, masterId }) => {
      queryClient.invalidateQueries({ queryKey: orderResponsesKey(orderId) });
      queryClient.invalidateQueries({ queryKey: myResponseKey(orderId, masterId) });
      queryClient.invalidateQueries({ queryKey: orderDetailKey(orderId) });
      // P0-5: после успешного отклика обновляем бейдж лимита в шапке master-главной.
      queryClient.invalidateQueries({ queryKey: ["response-limit-today"] });
    },
  });
}
