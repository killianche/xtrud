/**
 * Разделы «Найти задание» мозаикой (владелец, 2026-10-04, образец —
 * Wildberries): первые шесть разделов — крупные карточки в две колонки,
 * остальные — компактные плитки в три колонки. Вид включается флагом
 * find_tiles из админки («Настройки» → «Плитки»), откат — тот же
 * переключатель, без новой сборки (SectionGrid остаётся прежним видом).
 *
 * Иллюстраций разделов в каталоге нет — крупная карточка держится на
 * типографике и большой иконке в мягкой подложке справа внизу, как
 * предметы на карточках образца.
 */

import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { getCategoryIcon } from "@/lib/category-icons";
import { CARD_SHADOW } from "@/lib/shadows";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColors } from "@/lib/use-theme-color";
import type { SectionTile } from "./SectionGrid";

const SIDE = 16;
const GAP = 10;
/** Сколько разделов показываем крупно. */
export const MOSAIC_TOP = 6;

export function SectionMosaic({
  tiles,
  onPress,
}: {
  tiles: readonly SectionTile[];
  onPress: (id: string) => void;
}) {
  const tc = useThemeColors(["accent"]);
  const width = useAppWidth();
  const big = Math.floor((width - SIDE * 2 - GAP) / 2);
  const small = Math.floor((width - SIDE * 2 - GAP * 2) / 3);

  if (tiles.length === 0) {
    return (
      <AppText className="px-8 pt-8 text-center text-ios-body text-mute">
        Разделов пока нет. Загляните позже.
      </AppText>
    );
  }
  const top = tiles.slice(0, MOSAIC_TOP);
  const rest = tiles.slice(MOSAIC_TOP);

  return (
    <View className="px-4" style={{ gap: GAP }}>
      <View className="flex-row flex-wrap" style={{ gap: GAP }}>
        {top.map((tile) => {
          const Icon = getCategoryIcon(tile.icon);
          return (
            <Pressable
              key={tile.id}
              accessibilityRole="button"
              accessibilityLabel={tile.name}
              onPress={() => onPress(tile.id)}
              className="overflow-hidden rounded-3xl bg-surface-card p-4 active:opacity-80"
              style={[CARD_SHADOW, { width: big, minHeight: Math.round(big * 1.05) }]}
            >
              <AppText weight="bold" className="text-ios-body text-ink" numberOfLines={3}>
                {tile.name}
              </AppText>
              {/* Большая иконка в мягкой подложке у правого нижнего угла —
                  место предмета на карточке образца. В потоке, а не поверх:
                  при крупном шрифте карточка растёт и название не наезжает
                  на иконку (QA 2026-10-04). */}
              <View
                className="mt-auto items-center justify-center self-end rounded-full bg-accent-soft"
                style={{
                  width: Math.round(big * 0.5),
                  height: Math.round(big * 0.5),
                  marginRight: -Math.round(big * 0.08),
                  marginBottom: -Math.round(big * 0.08),
                }}
              >
                <Icon size={Math.round(big * 0.26)} weight="duotone" color={tc.accent} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {rest.length > 0 ? (
        <View className="flex-row flex-wrap" style={{ gap: GAP }}>
          {rest.map((tile) => {
            const Icon = getCategoryIcon(tile.icon);
            return (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityLabel={tile.name}
                onPress={() => onPress(tile.id)}
                className="items-center rounded-2xl bg-surface-card px-2 pb-3 pt-4 active:opacity-80"
                style={[CARD_SHADOW, { width: small, minHeight: Math.round(small * 1.05) }]}
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
                  <Icon size={24} weight="duotone" color={tc.accent} />
                </View>
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
      ) : null}
    </View>
  );
}
