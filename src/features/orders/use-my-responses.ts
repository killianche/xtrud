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
            price_min: r.price_min,
            price_max: r.price_max,
            price_mode: r.price_mode,
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
