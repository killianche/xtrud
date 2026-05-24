/**
 * QuickServices — горизонтальный ряд из 4 «быстрых категорий» на главной
 * клиента, сразу под hero-блоком (перед рекламными баннерами).
 *
 * ── Редизайн 2026-05-24 (Linear/Gravity-стиль) ───────────────────────────
 * Фидбэк владельца: привести блок к стилю наших новых референсов (Linear
 * Design — чистые карточки заказов + детали). Раньше были круги с цветными
 * объёмными 3D-эмодзи (fluent-emoji). Теперь — скруглённые плитки (rounded-2xl)
 * с МОНОХРОМНЫМИ line-иконками (Phosphor, в стиле Gravity UI), как иконки
 * категорий в карточках заказов. Единый чистый монохромный ряд в обеих темах.
 *
 * 4 категории (фикс.):
 *   1. Уборка квартиры → /category/cleaning   → Broom
 *   2. Сантехника      → /category/plumbing   → Wrench
 *   3. Климат и отопление → /category/climate → Snowflake
 *   4. Все мастера     → скролл к AllCategories → Users
 */

import { useRouter } from "expo-router";
import { Broom, Snowflake, Users, Wrench } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { IconComponent } from "@/types/icon";
import { useThemeColor } from "@/lib/use-theme-color";

interface QuickService {
  id: string;
  label: string;
  /** Монохромная line-иконка (Phosphor, Gravity-стиль). */
  Icon: IconComponent;
  /** Куда ведёт тап. null — это action-кнопка «Все мастера» (скролл). */
  href: string | null;
}

const SERVICES: QuickService[] = [
  { id: "cleaning", label: "Уборка квартиры", Icon: Broom, href: "/category/cleaning" },
  { id: "plumbing", label: "Сантехника", Icon: Wrench, href: "/category/plumbing" },
  { id: "climate", label: "Климат и отопление", Icon: Snowflake, href: "/category/climate" },
  { id: "all", label: "Все мастера", Icon: Users, href: null },
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
        {SERVICES.map((s) => (
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
            {/* Чистая плитка с тонкой границей + монохромная line-иконка (Linear). */}
            <View className="h-[68px] w-[68px] items-center justify-center rounded-2xl border border-hairline bg-canvas-soft">
              <s.Icon size={28} weight="regular" color={iconColor} />
            </View>
            <AppText
              weight="medium"
              className="mt-2 text-center text-caption text-ink"
              numberOfLines={2}
            >
              {s.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
