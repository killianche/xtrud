/**
 * CategoryPickerTwoStep — содержимое шага «Какая категория?» в два этапа:
 * раздел → подраздел (владелец, 2026-10-04, см. `category-picker.ts`).
 *
 * Без поиска — список разделов, как в «Настройках» (`ChoiceGroup`/
 * `ChoiceRow`, inset grouped); тап по разделу — `onOpenSection`: экран
 * `orders/new.tsx` открывает подкатегории отдельным экраном стека
 * (`orders/new/section.tsx`, который рисует этот же компонент с
 * `openSectionId`), поэтому жест «назад» возвращает к разделам. Строка
 * раздела показывает уже выбранную в нём подкатегорию значением справа.
 *
 * С поиском — подкатегории сразу по словам человека (useCategoryMatches:
 * название, синонимы и услуги каталога, название раздела), подпись —
 * совпавшая услуга или раздел, тап выбирает (№241). Переиспользует тот же `ChoiceRow`, что и остальные
 * шаги конструктора (`where.tsx`), и те же состояния загрузки/ошибки, что
 * `SubcategoryScreen` («Найти задание»).
 */

import { useMemo } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui/Skeleton";
import { onlyCategoryId } from "@/features/categories/only-category";
import type { CategoryL1 } from "@/features/categories/use-categories-l1";
import { useCategoryMatches } from "@/features/categories/use-category-matches";
import type { VisibleCategory } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";
import { ChoiceGroup, ChoiceRow } from "./ComposerRows";
import { groupCategoriesByL1 } from "./category-picker";

export interface CategoryPickerTwoStepProps {
  sections: readonly CategoryL1[];
  categories: readonly VisibleCategory[];
  selectedL2Id: string;
  /** Раздел, чьи подкатегории показать (экран `section.tsx`); null — список разделов. */
  openSectionId: string | null;
  onOpenSection: (id: string) => void;
  /** Текст поиска сверху — ищет сразу по подкатегориям и разделам. */
  query: string;
  onPick: (id: string) => void;
  loading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

export function CategoryPickerTwoStep({
  sections,
  categories,
  selectedL2Id,
  openSectionId,
  onOpenSection,
  query,
  onPick,
  loading = false,
  errorMessage,
  onRetry,
}: CategoryPickerTwoStepProps) {
  const tc = useThemeColors(["ink"]);
  const groups = useMemo(() => groupCategoriesByL1(sections, categories), [sections, categories]);
  // Умный подбор, как в «Специалистах»: «поменять розетку» → Электрика (№241).
  const { matches: hits, searching } = useCategoryMatches(query, categories, sections);
  const sectionName = (l1Id: string) => sections.find((s) => s.id === l1Id)?.name_ru;

  if (loading) {
    return (
      <View className="mx-4 overflow-hidden rounded-2xl bg-surface-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} className="flex-row items-center gap-3 px-4 py-3.5">
            <Skeleton width={36} height={36} className="rounded-lg" />
            <Skeleton height={17} className="flex-1 rounded" />
          </View>
        ))}
      </View>
    );
  }

  if (errorMessage) {
    return (
      <ChoiceGroup footer={errorMessage}>
        <ChoiceRow title="Повторить" onPress={() => onRetry?.()} last />
      </ChoiceGroup>
    );
  }

  if (query.trim()) {
    if (hits.length === 0) {
      return (
        <AppText className="px-8 pt-4 text-center text-ios-body text-mute">
          {searching ? "Ищем…" : "Ничего не нашлось. Попробуйте сказать иначе или выберите раздел."}
        </AppText>
      );
    }
    return (
      <ChoiceGroup>
        {hits.map(({ category, service }, i) => {
          const Icon = getCategoryIcon(category.icon);
          // Под названием — совпавшая услуга («Замена розетки / выключателя»),
          // иначе раздел, если он не повторяет название.
          const section = sectionName(category.l1_id);
          return (
            <ChoiceRow
              key={category.id}
              title={category.name_ru}
              subtitle={service ?? (section === category.name_ru ? undefined : section)}
              icon={<Icon size={18} weight="bold" color={tc.ink} />}
              selected={category.id === selectedL2Id}
              onPress={() => onPick(category.id)}
              last={i === hits.length - 1}
            />
          );
        })}
      </ChoiceGroup>
    );
  }

  const openGroup = openSectionId ? groups.find((g) => g.section.id === openSectionId) : undefined;

  if (!openGroup) {
    return (
      <ChoiceGroup>
        {groups.map((group, i) => {
          const Icon = getCategoryIcon(group.section.icon);
          const current = group.items.find((c) => c.id === selectedL2Id);
          // Раздел из одной подкатегории выбирается сразу, без второго экрана (№239).
          const onlyId = onlyCategoryId(group.items, group.section.id);
          const only = onlyId ? group.items.find((c) => c.id === onlyId) : undefined;
          if (only) {
            return (
              <ChoiceRow
                key={group.section.id}
                title={group.section.name_ru}
                icon={<Icon size={18} weight="bold" color={tc.ink} />}
                selected={only.id === selectedL2Id}
                onPress={() => onPick(only.id)}
                last={i === groups.length - 1}
              />
            );
          }
          return (
            <ChoiceRow
              key={group.section.id}
              title={group.section.name_ru}
              value={current?.name_ru}
              icon={<Icon size={18} weight="bold" color={tc.ink} />}
              navigates
              onPress={() => onOpenSection(group.section.id)}
              last={i === groups.length - 1}
            />
          );
        })}
      </ChoiceGroup>
    );
  }

  return (
    <ChoiceGroup>
      {openGroup.items.map((category, i) => {
        const Icon = getCategoryIcon(category.icon);
        return (
          <ChoiceRow
            key={category.id}
            title={category.name_ru}
            icon={<Icon size={18} weight="bold" color={tc.ink} />}
            selected={category.id === selectedL2Id}
            onPress={() => onPick(category.id)}
            last={i === openGroup.items.length - 1}
          />
        );
      })}
    </ChoiceGroup>
  );
}
