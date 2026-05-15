/**
 * Контент главной для active_role='master'.
 *
 * По фидбэку user 2026-05-15 — на главной мастера осталась ТОЛЬКО секция
 * «Готовы работать?» (AvailabilitySwitcher). Все остальные блоки (metrics
 * row, response-quota card, quick actions, tip-card) удалены: пользователь
 * предпочитает чистый экран — статус доступности — единственное действие,
 * остальное живёт в /profile и в нижних табах.
 *
 * История:
 *   - 2026-05-15 (perf-agent) — добавил metrics + quota + quick actions +
 *     tip-card. Сильно перегружено.
 *   - 2026-05-15 (поздно) — user: «остальное удали, только Готовы работать?».
 *
 * NB: единственный edge-case CTA остался: если у мастера нет категорий,
 *     показываем баннер «Добавьте категории» — без них он не виден в каталоге
 *     и нет смысла в самом статусе.
 */

import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { AvailabilitySwitcher } from "@/features/master-view/AvailabilitySwitcher";
import { MasterDashboardOrders } from "@/features/master-view/MasterDashboardOrders";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useThemeColor } from "@/lib/use-theme-color";

interface MasterHomeContentProps {
  userId: string;
}

export function MasterHomeContent({ userId }: MasterHomeContentProps) {
  const router = useRouter();
  const { data: myCats } = useMyMasterCategories(userId);
  const onPrimary = useThemeColor("on-primary");

  const hasCategories = (myCats?.length ?? 0) > 0;

  return (
    // Side padding px-4 (было px-5) — фидбэк user 2026-05-15: «отступы от
    // краёв не такие большие, чтобы edge-to-edge orders rows ниже визуально
    // совпадали со стилем /orders/search». Это «основа дизайна» — full-width
    // карточки + узкие boundary-padding'и.
    // Gap-8 (было gap-6) — больше воздуха между блоками статуса и заявок,
    // чтобы выглядело «дышаще» и круто.
    <View className="gap-8 px-4">
      <AvailabilitySwitcher userId={userId} />

      {/* Мои заявки — 2 секции «Меня выбрали / Я откликнулся» с tab pills.
          Раньше это был отдельный таб /orders в нижнем меню; по фидбэку
          2026-05-15 переехал на главную. Tab «orders» в TabBar скрыт для
          мастера (см. TabBar.tsx). */}
      {hasCategories ? <MasterDashboardOrders userId={userId} /> : null}

      {/* Categories callout — единственный conditional блок. Без категорий
          мастер не виден в каталоге, поэтому подталкиваем добавить.
          Иконка-кнопка теперь bg-accent (UI_PATTERNS — никаких чёрных
          квадратов вторичных действий). */}
      {!hasCategories ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(onboarding)/master-categories")}
          className="flex-row items-center justify-between rounded-xl border border-hairline bg-canvas-soft p-4 active:opacity-70"
        >
          <View className="flex-1">
            <AppText weight="semibold" className="text-body-md text-ink">
              Добавьте категории
            </AppText>
            <AppText className="mt-1 text-body-sm text-mute">
              Без категорий клиенты не увидят вас в каталоге.
            </AppText>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
            <Plus size={20} strokeWidth={2} color={onPrimary} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
