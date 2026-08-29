// Загрузка списка активных городов из БД (supabase.cities).
//
// ПРАВИЛО «Назрань · Магас — один город» (владелец 2026-05-24): в таблице
// cities раздельные записи `nazran` и `magas` остаются для legacy-lookup, но в
// любых списках выбора их быть не должно — только объединённый `nazran-magas`
// («Назрань · Магас»). Поэтому здесь фильтруем HIDDEN_PICKER_CITY_IDS: экраны
// выбора локации заказа (LocationPicker в orders/new, orders/edit,
// location-select) берут города отсюда, и так правило соблюдается везде, а не
// только в config-списке PICKER_CITIES.
import { useQuery } from "@tanstack/react-query";
import { BUNDLED_PICKER_CITIES } from "@/features/cities/bundled-cities";
import { HIDDEN_PICKER_CITY_IDS } from "@/lib/location-config";
import { isNetworkTransportError } from "@/lib/network-transport-error";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type City = Tables<"cities">;
export interface SourcedCities {
  items: City[];
  source: "backend" | "bundle";
}

export function useCities() {
  const result = useQuery<SourcedCities>({
    queryKey: ["cities"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("cities")
          .select("*")
          .eq("is_active", true)
          .order("sort_order");
        if (error) throw error;
        // A valid empty backend result remains authoritative and is never
        // replaced by the bundle.
        return {
          items: (data ?? []).filter((c) => !HIDDEN_PICKER_CITY_IDS.includes(c.id)),
          source: "backend" as const,
        };
      } catch (error) {
        if (!isNetworkTransportError(error)) throw error;
        return { items: [...BUNDLED_PICKER_CITIES], source: "bundle" as const };
      }
    },
    // A bundled answer is useful immediately but must become stale at once so
    // reconnect can replace it with authoritative backend data.
    staleTime: (queryState) => (queryState.state.data?.source === "bundle" ? 0 : 60 * 60_000),
    refetchOnReconnect: true,
  });

  return {
    ...result,
    data: result.data?.items,
    source: result.data?.source ?? null,
  };
}
