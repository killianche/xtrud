// Какие задания в ленте уже получили мой отклик — только id и статус.
//
// ЗАЧЕМ (FACT, QA 2026-09-06). Лента «Найти задание» тянула useMyResponses —
// ВСЕ мои отклики за всё время с полным JOIN на задание, категорию и город —
// ради одного: подсветить «Вы откликнулись». Лимит 5 откликов в день за год
// даёт до ~1800 строк с вложенными объектами на каждое открытие ленты.
// Здесь — две колонки, без JOIN.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function myRespondedOrderIdsKey(userId: string | undefined) {
  return ["my-responded-order-ids", userId] as const;
}

export function useMyRespondedOrderIds(userId: string | undefined) {
  return useQuery<Set<string>>({
    queryKey: myRespondedOrderIdsKey(userId),
    queryFn: async () => {
      if (!userId) return new Set();
      const { data, error } = await supabase
        .from("order_responses")
        .select("order_id,status")
        .eq("master_id", userId)
        .neq("status", "withdrawn");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.order_id));
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
