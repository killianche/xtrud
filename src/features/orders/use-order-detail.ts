// Hook загрузки одной заявки + JOIN на L2, city, client (для имени).

import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export interface OrderDetail extends Tables<"orders"> {
  l2: Pick<Tables<"categories_l2">, "id" | "name_ru" | "icon"> | null;
  city: Pick<Tables<"cities">, "id" | "name"> | null;
  client: Pick<
    Tables<"users">,
    | "id"
    | "first_name"
    | "last_name"
    | "avatar_url"
    | "rating_as_client_avg"
    | "rating_as_client_count"
  > | null;
}

export function orderDetailKey(orderId: string | undefined) {
  return ["order-detail", orderId] as const;
}

// Гостю телефоны заданий не отдаются (0222, аудит №161): у роли anon нет
// права на contact_phone и whatsapp_phone, поэтому «*» для гостя упал бы —
// запрашиваем явный список колонок. Вошедшим — как раньше.
const GUEST_ORDER_COLUMNS =
  "id, client_id, l2_id, l3_ids, title, description, city_id, district, village, urgency, executor_type, contact_mode, status, picked_master_id, responses_count, created_at, updated_at, expires_at, completed_at, created_via, budget_kind, budget_value, picked_at, master_marked_done_at, awaiting_confirmation_until, completion_kind, last_activity_at, cancelled_by, cancel_reason, dispute_opened_by, dispute_reason, disputed_at, resolved_at, resolved_by, resolution_kind, photo_urls, contact_name, preferred_date, address, extra_l2_ids";
const ORDER_RELATIONS =
  "l2:categories_l2(id, name_ru, icon), city:cities(id, name), client:users!orders_client_id_fkey(id, first_name, last_name, avatar_url, rating_as_client_avg, rating_as_client_count)";

export function useOrderDetail(orderId: string | undefined) {
  const { session } = useAuthSession();
  const guest = !session?.user?.id;
  return useQuery<OrderDetail | null>({
    // Гость и вошедший — разные выборки; префикс ключа общий для инвалидации.
    queryKey: [...orderDetailKey(orderId), guest ? "guest" : "user"],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select(guest ? `${GUEST_ORDER_COLUMNS}, ${ORDER_RELATIONS}` : `*, ${ORDER_RELATIONS}`)
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      // У гостя телефонов нет — поля пустые, экран показывает «войдите».
      if (!data) return null;
      const row = data as unknown as Record<string, unknown>;
      return {
        ...row,
        contact_phone: row.contact_phone ?? null,
        whatsapp_phone: row.whatsapp_phone ?? null,
      } as unknown as OrderDetail;
    },
    enabled: !!orderId,
    staleTime: 15_000,
  });
}
