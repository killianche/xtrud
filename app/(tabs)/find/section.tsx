/**
 * /find/section?l1= — подразделы раздела (второй уровень каталога «Найти
 * задание»). Справа — сколько открытых заданий; тап — задания подраздела.
 * Экран стека вкладки: нижняя панель остаётся, свайп от края — назад.
 */

import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { SubcategoryScreen } from "@/features/categories/SubcategoryScreen";
import { countByCategory } from "@/features/orders/find/open-order-facets";
import { useOpenOrderFacets } from "@/features/orders/find/use-open-order-facets";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { tasksLabel } from "@/features/orders/plural-ru";

export default function FindSectionRoute() {
  const router = useRouter();
  const { session } = useAuthSession();
  const facets = useOpenOrderFacets(session?.user?.id);
  const counts = useMemo(() => countByCategory(facets.data ?? []), [facets.data]);
  const setL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  return (
    <SubcategoryScreen
      valueFor={(id) => (facets.data && counts.get(id) ? String(counts.get(id)) : undefined)}
      labelFor={(id, name) =>
        facets.data ? `${name}, ${tasksLabel(counts.get(id) ?? 0)}` : undefined
      }
      onPick={(l2Id) => {
        setL2Ids([l2Id]);
        router.push("/find/results" as never);
      }}
    />
  );
}
