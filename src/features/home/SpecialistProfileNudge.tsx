/**
 * «Вы специалист?» на Главной — между `CinematicHero` и `MyOrdersShowcase`
 * (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §4.2). Разовый нудж-чеклист,
 * как «Завершите настройку iPhone» у Apple: виден, пока профиль не заполнен
 * достаточно, и пропадает, когда `isGoodEnough` становится true.
 *
 * Не рендерится: гостю, пока нужные запросы не ответили (без мигания и без
 * ложного «0 из 4» при сбое сети),
 * когда профиль уже заполнен достаточно, и когда профиль скрыт модерацией
 * (suspended) или аккаунт заблокирован/удалён — объяснение этого живёт
 * только на вкладке профиля, не здесь.
 */

import { useRouter } from "expo-router";
import { Wrench } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useUserRecord } from "@/features/auth/use-user-record";
import { ProfileProgressBar } from "@/features/specialist/ProfileProgressBar";
import { fillStartHref } from "@/features/specialist/profile-fill-flow";
import { useMySpecialistProfile } from "@/features/specialist/use-specialist";
import { useSpecialistProfileCompleteness } from "@/features/specialist/use-specialist-profile-completeness";
import { CARD_SHADOW } from "@/lib/shadows";
import { useThemeColors } from "@/lib/use-theme-color";

export function SpecialistProfileNudge({ userId }: { userId: string | undefined }) {
  const router = useRouter();
  const tc = useThemeColors(["accent", "on-accent"]);
  const completeness = useSpecialistProfileCompleteness(userId);
  const { data: user } = useUserRecord(userId);
  const { data: m } = useMySpecialistProfile(userId);

  const bannedOrDeleted = user?.status === "banned" || user?.status === "deleted";
  const suspended = m?.status === "suspended";

  if (
    !userId ||
    !completeness.ready ||
    completeness.isGoodEnough ||
    !completeness.nextStep ||
    suspended ||
    bannedOrDeleted
  ) {
    return null;
  }

  const { hasCategories, doneCount, total, missingSteps } = completeness;
  // Коротко: «небольшой блок — „Вы специалист?“, указатель и кнопка»
  // (владелец, 2026-10-23). Пояснение в три строки было лишним.
  const subtitle = hasCategories
    ? `Профиль заполнен на ${doneCount} из ${total}`
    : "Выберите категории, чтобы клиенты нашли вас";
  const buttonLabel = hasCategories ? "Заполнить профиль" : "Выбрать категории";
  // Все незаполненные пункты подряд, а не один экран и назад на главную (№362).
  const start = fillStartHref(missingSteps);
  const accessibilityLabel = `Вы специалист? ${subtitle}. ${buttonLabel}`;

  return (
    <View className="mt-10 px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => start && router.push(start as never)}
        className="rounded-2xl bg-surface-card p-4 active:opacity-85"
        style={CARD_SHADOW}
      >
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent">
            <Wrench size={22} weight="bold" color={tc["on-accent"]} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText weight="bold" className="text-ios-title3 text-ink">
              Вы специалист?
            </AppText>
            <AppText className="text-ios-subheadline text-mute">{subtitle}</AppText>
          </View>
        </View>
        {hasCategories ? (
          <View className="mt-3">
            <ProfileProgressBar doneCount={doneCount} total={total} hideFromAccessibility />
          </View>
        ) : null}
        {/* Визуальная кнопка-пилюля — часть одного большого Pressable, не
            отдельный элемент фокуса (вся карточка — один тап). */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="mt-4 min-h-12 items-center justify-center rounded-pill bg-accent px-4"
        >
          <AppText weight="semibold" className="text-ios-body text-on-accent">
            {buttonLabel}
          </AppText>
        </View>
      </Pressable>
    </View>
  );
}
