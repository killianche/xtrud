/**
 * Поиск по каталогу над сеткой разделов: подходящие подразделы списком
 * (подбор — useCategoryMatches: название, затем слова и услуги каталога,
 * «розетка» → Электрика). Тап — сразу к заданиям или специалистам подраздела.
 */

import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useCategoryMatches } from "@/features/categories/use-category-matches";
import type { VisibleCategory } from "@/features/categories/use-visible-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";

const NO_CATEGORIES: readonly VisibleCategory[] = [];

export function CategoryMatches({
  query,
  valueFor,
  labelFor,
  onPick,
}: {
  query: string;
  /** Значение справа (число заданий); undefined — пусто. */
  valueFor?: (l2Id: string) => string | undefined;
  /** Подпись для VoiceOver, если значение без слов непонятно. */
  labelFor?: (l2Id: string, name: string) => string | undefined;
  onPick: (l2Id: string) => void;
}) {
  const tc = useThemeColors(["ink"]);
  const categories = useVisibleCategories();
  const sections = useCategoriesL1();
  const { matches, searching, tooShort } = useCategoryMatches(
    query,
    categories.data ?? NO_CATEGORIES,
    sections.data,
    // Родитель переключается на подбор с первой буквы — и подбор с первой.
    1,
  );

  if (tooShort) return null;
  if (matches.length === 0) {
    return (
      <View className="px-8 pt-8">
        <AppText className="text-center text-ios-body text-mute">
          {searching || categories.isLoading
            ? "Ищем…"
            : "Ничего не нашли. Попробуйте другое слово."}
        </AppText>
      </View>
    );
  }

  return (
    <InsetGroup>
      {matches.map(({ category: c, service }, i) => {
        const Icon = getCategoryIcon(c.icon);
        return (
          <InsetRow
            key={c.id}
            title={c.name_ru}
            subtitle={service}
            icon={<Icon size={18} weight="bold" color={tc.ink} />}
            value={valueFor?.(c.id)}
            accessibilityLabel={labelFor?.(c.id, c.name_ru)}
            navigates
            onPress={() => onPick(c.id)}
            last={i === matches.length - 1}
          />
        );
      })}
    </InsetGroup>
  );
}
