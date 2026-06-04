/**
 * QuickServices — горизонтальный ряд из 4 «быстрых категорий» на главной
 * клиента, сразу под hero-блоком (перед рекламными баннерами).
 *
 * ── Редизайн 2026-05-27 (фирменные цветные иконки) ───────────────────────
 * Фидбэк владельца «иконки должны быть цветные и красивые». Раньше были моно
 * Phosphor (Broom/Wrench/Snowflake). Теперь — цветные иконки через
 * `getCategoryColorIconUrl` (тот же набор Iconify/twemoji, что в
 * /orders/category-select), с fallback на моно для не-L2 пунктов (Все мастера).
 *
 * 4 категории (фикс.):
 *   1. Уборка квартиры → /category/cleaning   → цветная (cleaning)
 *   2. Сантехника      → /category/plumbing   → цветная (plumbing — капля)
 *   3. Отопление       → /category/climate    → цветная (climate — термометр)
 *   4. Все мастера     → скролл к AllCategories → моно Users (special)
 */

import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { Users } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { useThemeColor } from "@/lib/use-theme-color";

interface QuickService {
  id: string;
  label: string;
  /** L2-id для маппинга в цветную иконку через getCategoryColorIconUrl.
   *  Для special «Все мастера» — null (fallback на моно Users). */
  l2Id: string | null;
  /** Куда ведёт тап. null — это action-кнопка «Все мастера» (скролл). */
  href: string | null;
}

const SERVICES: QuickService[] = [
  { id: "cleaning", label: "Уборка квартиры", l2Id: "cleaning", href: "/category/cleaning" },
  { id: "plumbing", label: "Сантехника", l2Id: "plumbing", href: "/category/plumbing" },
  { id: "climate", label: "Отопление", l2Id: "climate", href: "/category/climate" },
  { id: "all", label: "Все мастера", l2Id: null, href: null },
];

interface QuickServicesProps {
  /** Колбэк 4-й кнопки «Все мастера» — плавный скролл к блоку AllCategories. */
  onShowAll: () => void;
}

export function QuickServices({ onShowAll }: QuickServicesProps) {
  const router = useRouter();
  const iconColor = useThemeColor("ink");

  return (
    <View className="mt-6">
      <AppText weight="bold" className="mb-3 px-4 text-title-lg text-ink">
        Популярные категории
      </AppText>

      <View className="flex-row justify-between px-4">
        {SERVICES.map((s) => {
          const colorUrl = s.l2Id ? getCategoryColorIconUrl(s.l2Id) : null;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              onPress={() => {
                if (s.href === null) onShowAll();
                else router.push(s.href as never);
              }}
              className="items-center active:opacity-70"
              style={{ width: 78 }}
            >
              {/* Плитка с цветной иконкой (Iconify CDN). «Все мастера» — fallback
                  на моно Users (нет L2-маппинга). */}
              <View className="h-[68px] w-[68px] items-center justify-center rounded-2xl border border-hairline bg-canvas-soft">
                {colorUrl ? (
                  <ExpoImage
                    source={{ uri: colorUrl }}
                    style={{ width: 36, height: 36 }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Users size={28} weight="regular" color={iconColor} />
                )}
              </View>
              <AppText
                weight="medium"
                className="mt-2 text-center text-caption text-ink"
                numberOfLines={2}
              >
                {s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
