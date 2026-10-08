/**
 * Разделы каталога плитками в три колонки — первый экран «Найти задание» и
 * «Специалистов». Владелец, 2026-10-04: «все карточки — вот так, в три,
 * большие не нужны; и в специалистах так же; иконки — качественнее,
 * современнее». Плоская иконка раздела (свой набор, №267, src/lib/section-art.ts)
 * над названием; раздел без картинки — прежняя линейная иконка в подложке.
 * Тап открывает экран подразделов (docs/CATALOG_NAVIGATION_2026-10.md).
 */

import { Image } from "expo-image";
import { Pressable, useWindowDimensions, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCategoryIcon } from "@/lib/category-icons";
import { getSectionArt } from "@/lib/section-art";
import { CARD_SHADOW } from "@/lib/shadows";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColors } from "@/lib/use-theme-color";
import { sectionGridColumns } from "./section-grid-columns";

export interface SectionTile {
  id: string;
  name: string;
  icon: string | null;
  /** Строка под названием акцентом — выбранная подкатегория (№317). */
  meta?: string | null;
}

const SIDE = 16;
const GAP = 10;
const ART = 56;

/** Ширина плитки и её высота: квадрат в три колонки; при меньшем числе колонок — по тексту. */
function useTileSize(): { width: number; minHeight: number | undefined } {
  const appWidth = useAppWidth();
  const columns = sectionGridColumns(useWindowDimensions().fontScale);
  const width = Math.floor((appWidth - SIDE * 2 - GAP * (columns - 1)) / columns);
  return { width, minHeight: columns === 3 ? Math.round(width * 1.02) : undefined };
}

export function SectionGrid({
  tiles,
  onPress,
  selectedId,
  featuredIds = [],
}: {
  tiles: readonly SectionTile[];
  onPress: (id: string) => void;
  /** Выбранный раздел — обведён акцентом (фильтр «Найти задание», №238). */
  selectedId?: string | null;
  /**
   * Основные разделы (№296): первыми. Выглядят как остальные — розовую
   * заливку владелец убрал (2026-10-08, №317).
   */
  featuredIds?: readonly string[];
}) {
  const tc = useThemeColors(["accent"]);
  const size = useTileSize();
  if (tiles.length === 0) {
    // Пусто — значит пусто: одна строка, без пустой площадки (QA 2026-10-03).
    return (
      <AppText className="px-8 pt-8 text-center text-ios-body text-mute">
        Разделов пока нет. Загляните позже.
      </AppText>
    );
  }
  // Основные — первыми в их порядке, остальные — как пришли из базы.
  const ordered = [
    ...featuredIds.flatMap((id) => tiles.filter((t) => t.id === id)),
    ...tiles.filter((t) => !featuredIds.includes(t.id)),
  ];
  return (
    <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
      {ordered.map((tile) => {
        const art = getSectionArt(tile.id);
        const Icon = getCategoryIcon(tile.icon);
        const selected = selectedId === tile.id;
        return (
          <Pressable
            key={tile.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={tile.meta ? `${tile.name}, ${tile.meta}` : tile.name}
            onPress={() => onPress(tile.id)}
            className={`items-center rounded-2xl border-2 bg-surface-card px-2 pb-3 pt-4 active:opacity-80 ${
              selected ? "border-accent" : "border-transparent"
            }`}
            // min, а не fixed: при крупном шрифте карточка растёт по тексту.
            style={[CARD_SHADOW, { width: size.width, minHeight: size.minHeight }]}
          >
            {art ? (
              <Image
                source={art}
                style={{ width: ART, height: ART }}
                contentFit="contain"
                accessible={false}
              />
            ) : (
              <View
                className="items-center justify-center rounded-full bg-accent-soft"
                style={{ width: ART, height: ART }}
              >
                <Icon size={26} weight="duotone" color={tc.accent} />
              </View>
            )}
            <AppText
              weight="medium"
              className="mt-2 text-center text-ios-footnote text-ink"
              numberOfLines={3}
            >
              {tile.name}
            </AppText>
            {tile.meta ? (
              <AppText
                weight="semibold"
                className="mt-0.5 text-center text-ios-caption1 text-accent"
                numberOfLines={2}
              >
                {tile.meta}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Скелетон сетки на время загрузки каталога. */
export function SectionGridSkeleton({ count = 12 }: { count?: number }) {
  const size = useTileSize();
  return (
    <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: статичный скелетон.
          key={i}
          className="items-center rounded-2xl bg-surface-card px-2 pb-3 pt-4"
          style={[CARD_SHADOW, { width: size.width, minHeight: size.minHeight }]}
        >
          <Skeleton width={ART} height={ART} className="rounded-full" />
          <View className="mt-3 w-full items-center gap-1.5">
            <Skeleton height={12} className="w-4/5 rounded" />
            <Skeleton height={12} className="w-1/2 rounded" />
          </View>
        </View>
      ))}
    </View>
  );
}
