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
 *   - 2026-05-15 (поздно ещё раз) — пробовали MasterHomeContentV2 (hero
 *     status banner + стэк секций без табов). User откатил, оставляем v1.
 *
 * NB: единственный edge-case CTA остался: если у мастера нет категорий,
 *     показываем баннер «Добавьте категории» — без них он не виден в каталоге
 *     и нет смысла в самом статусе.
 */

import { useRouter } from "expo-router";
import { Plus } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useUserRecord } from "@/features/auth/use-user-record";
import { AvailabilitySwitcher } from "@/features/master-view/AvailabilitySwitcher";
import { MasterDashboardOrders } from "@/features/master-view/MasterDashboardOrders";
import { ResponseLimitBadge } from "@/features/master-view/ResponseLimitBadge";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useThemeColor } from "@/lib/use-theme-color";

interface MasterHomeContentProps {
  userId: string;
}

export function MasterHomeContent({ userId }: MasterHomeContentProps) {
  const router = useRouter();
  const { data: myCats } = useMyMasterCategories(userId);
  const { data: user } = useUserRecord(userId);
  const onPrimary = useThemeColor("on-primary");

  const hasCategories = (myCats?.length ?? 0) > 0;
  const firstName = user?.first_name?.trim();

  return (
    // Root БЕЗ горизонтального padding — карточки заказов внутри
    // MasterDashboardOrders идут edge-to-edge (от левого до правого края
    // экрана). Боковой padding px-4 даём только тем секциям, которым он
    // действительно нужен (статус, callout). Negative margin в RNW работает
    // нестабильно, поэтому правильнее не задавать его вообще.
    <View className="gap-8">
      {/* Greeting (Ассаламу алейкум — ингушская/мусульманская традиция,
          фидбек user 2026-05-16) — отдельной строкой full-width чтобы не
          усекаться рядом с pill. Квота откликов ниже — компактный pill
          self-start (раньше пробовали в одной flex-row, длинное имя обрезало
          приветствие). */}
      <View className="px-4 gap-2">
        <AppText weight="bold" className="text-title-lg text-ink" numberOfLines={1}>
          Ассаламу алейкум{firstName ? `, ${firstName}` : ""}
        </AppText>
        {hasCategories ? <ResponseLimitBadge variant="pill" /> : null}
      </View>

      <View className="px-4">
        <AvailabilitySwitcher userId={userId} />
      </View>

      {/* Мои заявки — tab pills получают свой px-4 внутри компонента,
          карточки идут full-bleed. Edge-to-edge hairline + pt-6 — визуальный
          разделитель между статусом доступности и блоком «заявки» (фидбек
          user 2026-05-16: «между блоками сделай побольше расстояние и черту»).
          Линия идёт edge-to-edge как стандартный section-divider Vercel/iOS. */}
      {hasCategories ? (
        <View className="border-t border-hairline pt-6">
          <MasterDashboardOrders userId={userId} />
        </View>
      ) : null}

      {/* Categories callout — единственный conditional блок. */}
      {!hasCategories ? (
        <View className="px-4">
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
              <Plus size={20} weight="bold" color={onPrimary} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
