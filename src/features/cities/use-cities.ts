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
import { HIDDEN_PICKER_CITY_IDS } from "@/lib/location-config";
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
      // Прячем раздельные Назрань/Магас — везде только «Назрань · Магас».
      return (data ?? []).filter((c) => !HIDDEN_PICKER_CITY_IDS.includes(c.id));
    },
    staleTime: 60 * 60_000, // 1 час — города почти не меняются
  });
}
