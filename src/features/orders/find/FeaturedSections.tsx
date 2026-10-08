/**
 * Ряд под заголовком «Найти задание» (владелец, 2026-10-07, №294): три
 * основные категории с картинками и четвёртая плитка «Категория» (весь
 * каталог; владелец, 2026-10-08, №316).
 * Касание основной — сразу её задания (весь раздел); повторное — снять.
 * «Все категории» — шторка каталога (/find-category).
 */

import { Image } from "expo-image";
import { SquaresFour } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { FEATURED_SECTIONS } from "@/lib/product-scope";
import { getSectionArt } from "@/lib/section-art";
import { CARD_SHADOW } from "@/lib/shadows";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColors } from "@/lib/use-theme-color";

const SIDE = 16;
const GAP = 8;
const ART = 40;

export function FeaturedSections({ onAll }: { onAll: () => void }) {
  const tc = useThemeColors(["ink"]);
  const width = Math.floor((useAppWidth() - SIDE * 2 - GAP * 3) / 4);
  const categories = useVisibleCategories();
  const l1Id = useOrdersSearchFiltersStore((s) => s.l1Id);
  const wholeSection = useOrdersSearchFiltersStore((s) => s.wholeSection);
  const setCategory = useOrdersSearchFiltersStore((s) => s.setCategory);

  // Раздел ещё не пришёл с сервера (старый кэш каталога) — плитки нет.
  const all = categories.data ?? [];
  const featured = FEATURED_SECTIONS.filter((f) => all.some((c) => c.l1_id === f.id));

  const toggle = (id: string) => {
    if (wholeSection && l1Id === id) {
      setCategory("", []);
      return;
    }
    const ids = all.filter((c) => c.l1_id === id).map((c) => c.id);
    setCategory(id, ids, true);
  };

  const tileClass = (selected: boolean) =>
    `items-center rounded-2xl border-2 px-1 pb-2.5 pt-3 active:opacity-80 ${
      selected ? "border-accent bg-accent-soft" : "border-transparent bg-surface-card"
    }`;

  return (
    <View className="flex-row px-4" style={{ gap: GAP }}>
      {featured.map((f) => {
        const art = getSectionArt(f.id);
        const selected = wholeSection && l1Id === f.id;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={f.short}
            accessibilityHint={selected ? "Показать все задания" : "Показать задания раздела"}
            onPress={() => toggle(f.id)}
            className={tileClass(selected)}
            style={[CARD_SHADOW, { width }]}
          >
            {art ? (
              <Image
                source={art}
                style={{ width: ART, height: ART }}
                contentFit="contain"
                accessible={false}
              />
            ) : (
              <View style={{ width: ART, height: ART }} />
            )}
            <AppText
              weight="medium"
              className="mt-1.5 text-center text-ios-caption1 text-ink"
              numberOfLines={2}
            >
              {f.short}
            </AppText>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Категория — весь каталог"
        onPress={onAll}
        className={tileClass(false)}
        style={[CARD_SHADOW, { width }]}
      >
        <View
          className="items-center justify-center rounded-full bg-canvas-soft-2"
          style={{ width: ART, height: ART }}
        >
          <SquaresFour size={22} weight="bold" color={tc.ink} />
        </View>
        <AppText
          weight="medium"
          className="mt-1.5 text-center text-ios-caption1 text-ink"
          numberOfLines={2}
        >
          Категория
        </AppText>
      </Pressable>
    </View>
  );
}
