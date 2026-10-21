// Данные карусели «Специалисты» на главной v2 (docs/HOME_V2_2026-10.md §4.2/§4.3).
//
// Один RPC-запрос `search_masters` на блок (design-quality §1.2 — не N+1 по
// категориям): категория берётся из самого свежего открытого задания
// пользователя, иначе — честная витрина по рейтингу без фильтра. Фоллбэк
// срабатывает только если персонализированный запрос дал 0 строк (не 1) —
// `home-personalization.ts` → `shouldFallbackToRatingShowcase`.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  pickSpecialistsCategoryId,
  shouldFallbackToRatingShowcase,
} from "@/features/home/home-personalization";
import type { MasterSearchResult } from "@/features/master-view/use-search-masters";
import { useMyOrders } from "@/features/orders/use-my-orders";
import { shouldHideDemo } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";

/** До 8 карточек в карусели (§4.3) — каталог на 2026-10-21 не растёт быстро. */
export const HOME_SPECIALISTS_LIMIT = 8;

async function searchMastersPage(
  l2Id: string | null,
  hideDemo: boolean,
): Promise<MasterSearchResult[]> {
  const { data, error } = await supabase.rpc("search_masters", {
    p_query: null,
    p_l2_id: l2Id,
    p_l1_id: null,
    p_city_id: null,
    p_sort: "rating",
    p_hide_demo: hideDemo,
    p_limit: HOME_SPECIALISTS_LIMIT,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as MasterSearchResult[];
}

export function useHomeSpecialists(userId: string | undefined) {
  // Гость (userId === undefined) получает data: [] от useMyOrders (enabled:
  // false) → categoryL2Id сразу null → тот же фоллбэк-путь, без отдельной
  // ветки (§4.2 п.3).
  const { data: myOrders } = useMyOrders(userId);
  const categoryL2Id = useMemo(() => pickSpecialistsCategoryId(myOrders ?? []), [myOrders]);
  const hideDemo = shouldHideDemo();

  const query = useQuery<MasterSearchResult[]>({
    queryKey: ["home-specialists", categoryL2Id, hideDemo],
    queryFn: async () => {
      const personalized = await searchMastersPage(categoryL2Id, hideDemo);
      if (categoryL2Id && shouldFallbackToRatingShowcase(personalized.length)) {
        return searchMastersPage(null, hideDemo);
      }
      return personalized;
    },
    staleTime: 30_000,
    // Хранится между запусками (persist в app/_layout.tsx): gcTime ≥ maxAge.
    gcTime: 24 * 60 * 60_000,
  });

  return { ...query, categoryL2Id };
}
