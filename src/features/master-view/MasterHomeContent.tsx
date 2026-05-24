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
import { Avatar } from "@/components/ui";
import { useUserRecord } from "@/features/auth/use-user-record";
import { AvailabilitySwitcher } from "@/features/master-view/AvailabilitySwitcher";
import { MasterDashboardOrders } from "@/features/master-view/MasterDashboardOrders";
import { MasterViewStatsCard } from "@/features/master-view/MasterViewStatsCard";
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
  const firstName = user?.first_name?.trim() || "Мастер";
  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Мастер";

  return (
    // Редизайн 2026-05-18 по фидбэку user:
    //   - Greeting «Ассаламу алейкум» убрано (визуальный шум, имя/аватар
    //     уже на /profile)
    //   - ResponseLimitBadge перенесён в TopBar (right action) — освобождает
    //     место под главный блок
    //   - AvailabilitySwitcher остаётся (компактный, кнопки помещаются)
    //   - MasterDashboardOrders — теперь HERO-блок (display-lg заголовок
    //     «Заказы для вас», как client home «Найдутся мастера»)
    <View className="gap-7">
      {/* ── ВЕРХНЯЯ СВОДКА (вспомогательная) ──────────────────────────────
          Редизайн 2026-05-24 «убрать лишнее, сделать красиво». Раньше — три
          разнородных «голоса»: гигантское приветствие в две строки (24px×2),
          мелкая строка статистики с иконкой-графиком и разделителями, и
          отдельная секция «ГОТОВНОСТЬ К ЗАКАЗАМ» с uppercase-заголовком.
          Теперь собрано в один спокойный статус-блок (Vercel/Linear-минимализм):
            1) аватар + приветствие в ОДНУ строку (display-sm) + тихая строка
               статистики под именем — greeting и метрики читаются как единое;
            2) единственный контрол готовности (без заголовка-секции, countdown
               внутри триггера). Один акцент (зелёная точка), чистые hairlines,
               много воздуха. Сводка больше не перетягивает внимание с главного
               блока «Ваши отклики» ниже. */}
      <View className="gap-5 pt-1">
        {/* Приветствие: аватар (инициалы, если нет фото) + «Ассаламу алейкум,
            Имя» в одну строку, под ним тихая строка статистики за неделю. */}
        <View className="flex-row items-center gap-3 px-4">
          <Avatar url={user?.avatar_url} name={fullName} seed={userId} size="lg" />
          <View className="min-w-0 flex-1 gap-1">
            <AppText className="text-display-sm text-ink" numberOfLines={1}>
              <AppText weight="medium" className="text-display-sm text-mute">
                Ассаламу алейкум,{" "}
              </AppText>
              <AppText weight="bold" className="text-display-sm text-ink">
                {firstName}
              </AppText>
            </AppText>
            <MasterViewStatsCard userId={userId} />
          </View>
        </View>

        {/* Единственный контрол сводки — готовность к заказам. */}
        <View className="px-4">
          <AvailabilitySwitcher userId={userId} />
        </View>
      </View>

      {/* ── ОСНОВНОЙ БЛОК МАСТЕРА: «Ваши отклики» ─────────────────────
          Сильно отделён от сводки: full-bleed hairline + крупный воздух
          (mt-1 + pt-7), внутри — заголовок 32px. Это центр экрана, всё
          выше — вспомогательная сводка. */}
      {hasCategories ? (
        <View className="mt-1 border-t border-hairline pt-7">
          <MasterDashboardOrders userId={userId} />
        </View>
      ) : null}

      {/* Categories callout — единственный conditional блок. */}
      {!hasCategories ? (
        <View className="px-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(onboarding)/master-categories")}
            className="flex-row items-center justify-between rounded-2xl border border-hairline bg-canvas-soft p-5 active:opacity-70"
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
