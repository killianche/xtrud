/**
 * Разделы каталога карточками в две колонки — первый экран «Найти задание»
 * и «Специалистов» (владелец, 2026-10-03: «как у больших компаний —
 * карточки, при нажатии открывается следующая страница»). Тап открывает
 * экран подразделов; раскрытия на месте больше нет (HIG: disclosure — для
 * второстепенных деталей, не для уровней каталога).
 * Разбор и варианты — docs/CATALOG_NAVIGATION_2026-10.md.
 */

import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCategoryIcon } from "@/lib/category-icons";
import { CARD_SHADOW } from "@/lib/shadows";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColors } from "@/lib/use-theme-color";

export interface SectionTile {
  id: string;
  name: string;
  icon: string | null;
  /** Тихая строка под названием: «4 задания», «10 категорий». */
  meta?: string | null;
}

const SIDE = 16;
const GAP = 12;

function useTileWidth(): number {
  const width = useAppWidth();
  return Math.floor((width - SIDE * 2 - GAP) / 2);
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
        const Icon = getCategoryIcon(tile.icon);
        return (
          <Pressable
            key={tile.id}
            accessibilityRole="button"
            accessibilityLabel={tile.meta ? `${tile.name}, ${tile.meta}` : tile.name}
            onPress={() => onPress(tile.id)}
            className="rounded-2xl bg-surface-card p-4 active:opacity-80"
            // Чуть выше ширины не делаем: карточка растёт по высоте сама, если
            // название в три строки или крупный шрифт (min, а не fixed).
            style={[CARD_SHADOW, { width: tileWidth, minHeight: Math.round(tileWidth * 0.82) }]}
          >
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
              <Icon size={22} weight="bold" color={tc.accent} />
            </View>
            <View className="mt-auto pt-3">
              <AppText weight="semibold" className="text-ios-body text-ink" numberOfLines={3}>
                {tile.name}
              </AppText>
              {tile.meta ? (
                <AppText className="mt-0.5 text-ios-footnote text-mute" numberOfLines={1}>
                  {tile.meta}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Скелетон сетки на время загрузки каталога. */
export function SectionGridSkeleton({ count = 10 }: { count?: number }) {
  const tileWidth = useTileWidth();
  return (
    <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: статичный скелетон.
          key={i}
          className="rounded-2xl bg-surface-card p-4"
          style={[CARD_SHADOW, { width: tileWidth, minHeight: Math.round(tileWidth * 0.82) }]}
        >
          <Skeleton width={44} height={44} className="rounded-xl" />
          <View className="mt-auto gap-2 pt-3">
            <Skeleton height={17} className="w-4/5 rounded" />
            <Skeleton height={13} className="w-2/5 rounded" />
          </View>
        </View>
      ))}
    </View>
  );
}
