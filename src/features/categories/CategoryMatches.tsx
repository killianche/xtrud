/**
 * Поиск по каталогу над сеткой разделов: подходящие подразделы списком.
 * Сначала совпадения по названию (мгновенно, без сети), затем — по словам
 * каталога («розетка» → Электрика) из search_categories. Тап — сразу к
 * заданиям или специалистам подраздела.
 */

import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";

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
  const q = query.trim().toLowerCase();
  const categories = useVisibleCategories();
  const search = useSearchCategories(q, 12);
  const all = categories.data ?? [];

  const ids: string[] = [];
  const hint = new Map<string, string>();
  for (const c of all) if (c.name_ru.toLowerCase().includes(q)) ids.push(c.id);
  for (const hit of search.data?.hits ?? []) {
    if (!all.some((c) => c.id === hit.l2_id)) continue;
    if (!ids.includes(hit.l2_id)) ids.push(hit.l2_id);
    if (hit.kind === "l3" && !hint.has(hit.l2_id)) hint.set(hit.l2_id, hit.name_ru);
  }

  if (ids.length === 0) {
    return (
      <View className="px-8 pt-8">
        <AppText className="text-center text-ios-body text-mute">
          {search.isFetching || categories.isLoading
            ? "Ищем…"
            : "Ничего не нашли. Попробуйте другое слово."}
        </AppText>
      </View>
    );
  }

  return (
    <InsetGroup>
      {ids.map((id, i) => {
        const c = all.find((x) => x.id === id);
        if (!c) return null;
        const Icon = getCategoryIcon(c.icon);
        return (
          <InsetRow
            key={id}
            title={c.name_ru}
            subtitle={hint.get(id)}
            icon={<Icon size={18} weight="bold" color={tc.ink} />}
            value={valueFor?.(id)}
            accessibilityLabel={labelFor?.(id, c.name_ru)}
            navigates
            onPress={() => onPick(id)}
            last={i === ids.length - 1}
          />
        );
      })}
    </InsetGroup>
  );
}
