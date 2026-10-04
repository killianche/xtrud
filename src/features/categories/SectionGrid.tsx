/**
 * Разделы каталога плитками в три колонки — первый экран «Найти задание» и
 * «Специалистов». Владелец, 2026-10-04: «все карточки — вот так, в три,
 * большие не нужны; и в специалистах так же; иконки — качественнее,
 * современнее». Объёмная иконка раздела (Fluent Emoji 3D, src/lib/section-art.ts)
 * над названием; раздел без картинки — прежняя линейная иконка в подложке.
 * Тап открывает экран подразделов (docs/CATALOG_NAVIGATION_2026-10.md).
 */

import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCategoryIcon } from "@/lib/category-icons";
import { getSectionArt } from "@/lib/section-art";
import { CARD_SHADOW } from "@/lib/shadows";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColors } from "@/lib/use-theme-color";

export interface SectionTile {
  id: string;
  name: string;
  icon: string | null;
  /** Тихая строка под названием (сейчас не используется). */
  meta?: string | null;
}

const SIDE = 16;
const GAP = 10;
const COLUMNS = 3;
const ART = 56;

function useTileWidth(): number {
  const width = useAppWidth();
  return Math.floor((width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
}

export function SectionGrid({
  tiles,
  onPress,
}: {
  tiles: readonly SectionTile[];
  onPress: (id: string) => void;
}) {
  const tc = useThemeColors(["accent"]);
  const tileWidth = useTileWidth();
  if (tiles.length === 0) {
    // Пусто — значит пусто: одна строка, без пустой площадки (QA 2026-10-03).
    return (
      <AppText className="px-8 pt-8 text-center text-ios-body text-mute">
        Разделов пока нет. Загляните позже.
      </AppText>
    );
  }
  return (
    <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
      {tiles.map((tile) => {
        const art = getSectionArt(tile.id);
        const Icon = getCategoryIcon(tile.icon);
        return (
          <Pressable
            key={tile.id}
            accessibilityRole="button"
            accessibilityLabel={tile.meta ? `${tile.name}, ${tile.meta}` : tile.name}
            onPress={() => onPress(tile.id)}
            className="items-center rounded-2xl bg-surface-card px-2 pb-3 pt-4 active:opacity-80"
            // min, а не fixed: при крупном шрифте карточка растёт по тексту.
            style={[CARD_SHADOW, { width: tileWidth, minHeight: Math.round(tileWidth * 1.02) }]}
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
          </Pressable>
        );
      })}
    </View>
  );
}

/** Скелетон сетки на время загрузки каталога. */
export function SectionGridSkeleton({ count = 12 }: { count?: number }) {
  const tileWidth = useTileWidth();
  return (
    <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: статичный скелетон.
          key={i}
          className="items-center rounded-2xl bg-surface-card px-2 pb-3 pt-4"
          style={[CARD_SHADOW, { width: tileWidth, minHeight: Math.round(tileWidth * 1.02) }]}
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
