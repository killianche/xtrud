/**
 * /category/sort-select — пикер сортировки списка мастеров в категории.
 *
 * Раньше жил как `<PickerSheet>` внутри `category/[id].tsx`, завёрнутый в
 * самописный `<Modal>` (`BottomSheet`-семейство full-screen попапов). Теперь —
 * отдельный route с нативной iOS `formSheet`-модальностью
 * (`docs/IOS_FOUNDATION.md` §2.4): выбор параметра/фильтра → `formSheet` с
 * `sheetAllowedDetents`, а не самописный full-screen лист.
 *
 * Всего 3 предсказуемых по высоте варианта без поиска → `fitToContents`
 * (card сама измеряет естественную высоту контента, без внутреннего скролла).
 *
 * Handshake — тот же паттерн, что у `orders/location-select` /
 * `orders/category-select`: текущее значение приходит через URL-param
 * (`sortBy`), выбор коммитится в `useCategoryFilterPickerStore` + `router.back()`.
 * `category/[id].tsx` слушает store через `useEffect` и применяет выбор в свой
 * local state (см. `src/features/orders/LocationPicker.tsx` — тот же handshake
 * для `useOrderDraftStore.selectedLocation`).
 *
 * Deep link: без родительского контекста (например, открыт напрямую) экран
 * всё равно рендерит валидный список — `sortBy` по умолчанию `"rating"`,
 * запись в store безопасна даже если `category/[id].tsx` не смонтирован (просто
 * никто её не прочитает).
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Briefcase, Calendar, Star } from "phosphor-react-native";
import { PickerSheetPage } from "@/components/ui";
import {
  type CategorySortBy,
  useCategoryFilterPickerStore,
} from "@/features/categories/category-filter-picker-store";
import { useThemeColors } from "@/lib/use-theme-color";

const SORT_IDS: readonly CategorySortBy[] = ["rating", "experience", "availability"];

function isSortBy(value: string | undefined): value is CategorySortBy {
  return !!value && (SORT_IDS as readonly string[]).includes(value);
}

export default function SortSelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sortBy?: string }>();
  const setSortResult = useCategoryFilterPickerStore((s) => s.setSortResult);
  const tc = useThemeColors(["ink"]);

  const currentSortBy: CategorySortBy = isSortBy(params.sortBy) ? params.sortBy : "rating";

  const close = () => router.back();

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <PickerSheetPage
        title="Сортировка"
        scrollable={false}
        options={[
          {
            id: "rating",
            title: "По рейтингу",
            subtitle: "Сначала с лучшими отзывами",
            icon: <Star size={18} weight="bold" color={tc.ink} />,
          },
          {
            id: "experience",
            title: "По опыту",
            subtitle: "Сначала самые опытные",
            icon: <Briefcase size={18} weight="bold" color={tc.ink} />,
          },
          {
            id: "availability",
            title: "Свободные сначала",
            subtitle: "Кто готов сегодня и на неделе",
            icon: <Calendar size={18} weight="bold" color={tc.ink} />,
          },
        ]}
        selectedId={currentSortBy}
        onSelect={(id) => {
          if (isSortBy(id)) setSortResult(id);
          close();
        }}
        onClose={close}
      />
    </>
  );
}
