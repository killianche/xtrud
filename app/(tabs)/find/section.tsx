/**
 * /find/section?l1= — подразделы раздела (второй уровень каталога «Найти
 * задание»). Тап — задания подраздела. Без счётчиков (владелец, 2026-10-03:
 * «эти цифры не нужны, полностью убери»).
 * Экран стека вкладки: нижняя панель остаётся, свайп от края — назад.
 */

import { useRouter } from "expo-router";
import { SubcategoryScreen } from "@/features/categories/SubcategoryScreen";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";

export default function FindSectionRoute() {
  const router = useRouter();
  const setL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  return (
    <SubcategoryScreen
      onPick={(l2Id) => {
        setL2Ids([l2Id]);
        router.push("/find/results" as never);
      }}
    />
  );
}
