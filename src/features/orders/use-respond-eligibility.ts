// Можно ли откликнуться на задание (владелец, 2026-10-04, №203): в простых
// категориях (разнорабочие, уборка, грузчики…) — любому, в специальных
// (плитка, электрика…) — только специалисту с этой категорией в профиле.
// Правило проверяет база при отклике (0217); здесь — заранее, чтобы
// предложить добавить категорию, а не показывать ошибку после формы.
// Пока ответа нет или сервер старый — не мешаем: база всё равно проверит.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

import { parseEligibility } from "./respond-eligibility";

export type { RespondEligibility } from "./respond-eligibility";

export function respondEligibilityKey(orderId: string | undefined) {
  return ["respond-eligibility", orderId] as const;
}

export function useRespondEligibility(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: respondEligibilityKey(orderId),
    enabled: enabled && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_respond_to_order", {
        p_order_id: orderId as string,
      });
      if (error) throw error;
      return parseEligibility(data);
    },
    staleTime: 30_000,
  });
}
