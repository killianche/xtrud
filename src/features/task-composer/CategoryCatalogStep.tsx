/**
 * Каталог разделов шага «Какая категория?»: поиск сверху, разделы списком,
 * раздел → его подкатегории отдельным экраном (`orders/new/section`).
 *
 * Где показывается (№242, docs/COMPOSER_QUICK_START_2026-10.md):
 *  - первым экраном — при откате флагом `composer_start = "catalog"`, при
 *    правке категории с проверки или опубликованного задания, при устаревшей
 *    категории (там меняют именно категорию);
 *  - запасным экраном `orders/new/catalog` — из подсказок «Что нужно
 *    сделать?» («Другая категория», «Выбрать из списка»).
 */

import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SearchField } from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { CategoryPickerTwoStep } from "./CategoryPickerTwoStep";
import { ChoiceGroup, ChoiceRow } from "./ComposerRows";
import { ComposerScreen } from "./ComposerScreen";
import { useComposer } from "./composer-store";
import { COMPOSER_SECTION_ROUTE, isStepValid } from "./steps";
import { useStepNavigation } from "./use-step-navigation";

export function CategoryCatalogStep({
  subtitle,
  onBack,
}: {
  subtitle?: string;
  /** Кнопка «назад»; нет — первый экран создания (только «закрыть»). */
  onBack?: () => void;
}) {
  const router = useRouter();
  const { values, patch, mode } = useComposer();
  const nav = useStepNavigation("category");
  const [query, setQuery] = useState("");
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();

  // Раздел — отдельный экран: системный жест «назад» с него возвращает сюда.
  // «Из проверки» передаётся дальше, чтобы выбор вернул на проверку.
  const openSection = (id: string) =>
    router.push({
      pathname: COMPOSER_SECTION_ROUTE,
      params: nav.fromReview ? { id, from: "review" } : { id },
    } as never);

  // Выбор подкатегории — сразу следующий шаг (владелец, 2026-10-04): «одно
  // действие вместо отметить + Далее». Дополнительные категории (0195)
  // очищаются — этот экран их больше не предлагает.
  const onPick = (id: string) => {
    patch({ l2Id: id, extraL2Ids: [] });
    nav.goNext();
  };

  return (
    <ComposerScreen
      step="category"
      title="Какая категория?"
      subtitle={subtitle}
      onBack={onBack}
      onClose={nav.close}
      // Кнопки «Далее» нет: выбор подраздела сам ведёт на следующий шаг.
      hideActions
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("category", values)}
      onPrimary={nav.goNext}
    >
      <View className="mb-5 px-4">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Например, поменять розетку"
          showCancel={false}
          accessibilityLabel="Поиск категории"
        />
      </View>
      <CategoryPickerTwoStep
        sections={l1.data ?? []}
        categories={categories.data ?? []}
        selectedL2Id={values.l2Id}
        openSectionId={null}
        onOpenSection={openSection}
        query={query}
        onPick={onPick}
        loading={categories.isLoading || l1.isLoading}
        errorMessage={
          categories.error || l1.error
            ? "Не удалось загрузить категории. Проверьте связь."
            : undefined
        }
        onRetry={() => {
          void categories.refetch();
          void l1.refetch();
        }}
      />
      {/* Не нашлось в каталоге — публикуем «Без категории», подберёт админ
          (№251). Только для нового задания: у опубликованного категория уже есть. */}
      {mode.kind === "create" && !query.trim() ? (
        <ChoiceGroup footer="Задание увидят сразу, а категорию подберём сами.">
          <ChoiceRow
            title="Нет подходящей категории"
            selected={values.l2Id === UNCATEGORIZED_L2_ID}
            onPress={() => onPick(UNCATEGORIZED_L2_ID)}
            last
          />
        </ChoiceGroup>
      ) : null}
    </ComposerScreen>
  );
}
