// Поиск специалистов для вкладки «Специалисты».
//
// Один вызов RPC отдаёт готовый список: имя, категории, город, рейтинг, опыт.
// Поиск идёт и по имени, и по названию категории — «электрик» находит людей
// из категории «Электрика». Фильтрация и ограничение делаются на сервере,
// поэтому на устройство не приезжает лишнего (design-quality §1.2).
//
// Пустой запрос — не пустой экран: возвращается витрина по рейтингу.

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { shouldHideDemo } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";

export interface MasterSearchResult {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  city_id: string | null;
  city_name: string | null;
  district: string | null;
  bio: string | null;
  experience_years: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  closed_deals: number | null;
  categories: string[];
}

const PAGE_SIZE = 30;

export function useSearchMasters(query: string, l2Id: string | null = null) {
  const trimmed = query.trim();

  return useQuery<MasterSearchResult[]>({
    queryKey: ["search-masters", trimmed, l2Id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_masters", {
        p_query: trimmed.length > 0 ? trimmed : null,
        p_l2_id: l2Id,
        p_city_id: null,
        p_hide_demo: shouldHideDemo(),
        p_limit: PAGE_SIZE,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as MasterSearchResult[];
    },
    // Прошлый результат остаётся на экране, пока едет новый: список не
    // моргает пустотой на каждую букву.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
