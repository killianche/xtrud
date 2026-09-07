/**
 * /category/l3-select — пикер конкретной услуги (L3) внутри категории (L2).
 *
 * См. `sort-select.tsx` / `city-select.tsx` — тот же паттерн: нативная iOS
 * `formSheet`-модальность вместо самописного `<Modal>`, handshake через
 * `useCategoryFilterPickerStore` + `router.back()`.
 *
 * ~290 L3-услуг в самой крупной L2-категории — длинный список, поэтому
 * массив detents `[0.6, 1.0]` со скроллом (не `fitToContents`) +
 * `sheetExpandsWhenScrolledToEdge`, как и у `city-select`.
 *
 * В обычном флоу `category/[id].tsx` уже держит `useCategoryDetail(categoryId)`
 * в react-query кеше (staleTime 30 мин) — переход на этот route почти всегда
 * кеш-хит без сетевого запроса. Но по deep link (без родительского экрана)
 * кеша может не быть — экран сам грузит категорию по `categoryId` из URL и
 * показывает loading/error/empty состояния, а не падает.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ListChecks } from "phosphor-react-native";
import { type PickerOption, PickerSheetPage } from "@/components/ui";
import { useCategoryFilterPickerStore } from "@/features/categories/category-filter-picker-store";
import { useCategoryDetail } from "@/features/categories/use-category-detail";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";

const ALL_SERVICES_ID = "__all";

// Параметры шторки — константа модуля. Объект, создаваемый заново при каждом
// рендере, заставлял систему переоткрывать шторку и сбрасывать выбор
// (владелец, 2026-09-07: «нажимаю категорию — не выбирается, шторка
// открывается повторно»).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.6, 1.0],
  sheetExpandsWhenScrolledToEdge: true,
  sheetGrabberVisible: true,
};

export default function L3SelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string; l3Filter?: string }>();
  const categoryId = typeof params.categoryId === "string" ? params.categoryId : undefined;
  const { data, error, isLoading, refetch } = useCategoryDetail(categoryId);
  const setL3Result = useCategoryFilterPickerStore((s) => s.setL3Result);
  const tc = useThemeColors(["ink", "mute"]);

  const categoryName = data?.category.name_ru ?? "Услуга";
  const CategoryIcon = getCategoryIcon(data?.category.icon);
  const services = data?.services ?? [];
  const currentL3Id = params.l3Filter || ALL_SERVICES_ID;

  const close = () => router.back();

  const options: PickerOption[] = [
    {
      id: ALL_SERVICES_ID,
      title: "Все услуги",
      icon: <ListChecks size={18} weight="bold" color={tc.ink} />,
    },
    ...services.map<PickerOption>((s) => ({
      id: s.id,
      title: s.name_ru,
      // Иконка родительской категории — один набор (Phosphor) на всё
      // приложение, см. src/lib/category-icons.ts.
      icon: <CategoryIcon size={18} weight="bold" color={tc.mute} />,
    })),
  ];

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <PickerSheetPage
        title={categoryName}
        loading={!categoryId || isLoading}
        errorMessage={error ? `Не удалось загрузить: ${error.message}` : undefined}
        onRetry={() => void refetch()}
        options={options}
        selectedId={currentL3Id}
        onSelect={(id) => {
          setL3Result(id === ALL_SERVICES_ID ? null : id);
          close();
        }}
        onClose={close}
        searchable={services.length >= 8}
        searchPlaceholder="Например, замена смесителя"
        resettable={currentL3Id !== ALL_SERVICES_ID}
        resetLabel="Сбросить"
      />
    </>
  );
}
