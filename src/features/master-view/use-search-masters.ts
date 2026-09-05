// Поиск специалистов — единственный источник списка для вкладки «Специалисты».
//
// Один вызов RPC отдаёт готовый список: имя, категории, город, рейтинг, опыт.
// Поиск идёт и по имени, и по названию категории — «электрик» находит людей
// из категории «Электрика». Фильтры и сортировка считаются на сервере
// (миграция 0158), на устройство не приезжает лишнего (design-quality §1.2).
//
// DECISION владельца 2026-09-06: тап по категории на главной ведёт сюда с
// готовым фильтром, а на самом экране — поиск, категория, город, сортировка.
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

export type MasterSort = "rating" | "experience" | "availability";

export interface MasterSearchFilters {
  query: string;
  /** Раздел (L1) — крупная категория с главной. */
  l1Id: string | null;
  /** Конкретная категория (L2). Если задана, раздел не нужен. */
  l2Id: string | null;
  /** Город; null — вся республика. */
  cityId: string | null;
  sort: MasterSort;
}

const PAGE_SIZE = 30;

export function useSearchMasters(filters: MasterSearchFilters) {
  const trimmed = filters.query.trim();

  return useQuery<MasterSearchResult[]>({
    queryKey: ["search-masters", trimmed, filters.l1Id, filters.l2Id, filters.cityId, filters.sort],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_masters", {
        p_query: trimmed.length > 0 ? trimmed : null,
        p_l2_id: filters.l2Id,
        p_l1_id: filters.l2Id ? null : filters.l1Id,
        p_city_id: filters.cityId,
        p_sort: filters.sort,
        p_hide_demo: shouldHideDemo(),
        p_limit: PAGE_SIZE,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as MasterSearchResult[];
    },
    // Прошлый результат остаётся на экране, пока едет новый: список не
    // моргает пустотой на каждую букву и на каждый фильтр.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
