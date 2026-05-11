// Загрузка списка активных городов.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type City = Tables<"cities">;

export function useCities() {
  return useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60_000, // 1 час — города почти не меняются
  });
}
