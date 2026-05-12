/**
 * Hooks для публичной страницы клиента `/client/[id]`.
 *
 * Минималистичная по сравнению с master-public: у клиента нет bio, категорий,
 * портфолио. Показываем только репутацию (rating, count, completed_count).
 *
 * RLS уже разрешает SELECT публично: users + cities + reviews (visible).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type ClientPublicProfile = {
  user: Pick<
    Tables<"users">,
    | "id"
    | "first_name"
    | "last_name"
    | "avatar_url"
    | "city_id"
    | "district"
    | "is_client"
    | "rating_as_client_avg"
    | "rating_as_client_count"
    | "created_at"
  >;
  city: { id: string; name: string } | null;
  completedOrdersCount: number;
};

export function useClientPublicProfile(clientId: string | null | undefined) {
  return useQuery<ClientPublicProfile | null>({
    queryKey: ["client-public", clientId],
    queryFn: async () => {
      if (!clientId) return null;

      const { data: userData, error: userErr } = await supabase
        .from("users")
        .select(
          "id, first_name, last_name, avatar_url, city_id, district, is_client, rating_as_client_avg, rating_as_client_count, created_at",
        )
        .eq("id", clientId)
        .maybeSingle();
      if (userErr) throw userErr;
      if (!userData) return null;

      let city: { id: string; name: string } | null = null;
      if (userData.city_id) {
        const { data: cityData } = await supabase
          .from("cities")
          .select("id, name")
          .eq("id", userData.city_id)
          .maybeSingle();
        if (cityData) city = cityData;
      }

      // RLS orders позволяет SELECT для own/picked/open/in_progress/completed.
      // Здесь нам нужен COUNT(*) WHERE client_id = clientId AND status = 'completed'.
      // Если читающий — не сам клиент и не picked_master, видны только open/completed
      // (orders_read_open_or_own policy). Для completed-COUNT это достаточно.
      const { count: completedCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", "completed");

      return {
        user: userData,
        city,
        completedOrdersCount: completedCount ?? 0,
      };
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });
}
