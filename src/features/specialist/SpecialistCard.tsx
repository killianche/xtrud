/**
 * «Я специалист» в «Аккаунте» — крупной карточкой, а не мелкой строкой
 * (владелец, 2026-10-08, №303: «кнопку побольше, остальные инструменты
 * поменьше; акцент на том, что сначала заполнить обязательное — категорию»).
 *
 * Без категории — объяснение и одна главная кнопка «Выбрать категории»:
 * откликаться на задания может каждый (0247, №325), а категории нужны, чтобы
 * вас находили в «Специалистах» и присылали подходящие задания. Список шагов —
 * как чек-лист настройки в приложениях Apple: видно, что готово и что дальше.
 * С категорией — компактная карточка-переход в профиль специалиста.
 */

import { useRouter } from "expo-router";
import { CaretRight, CheckCircle, CircleIcon as Circle, Wrench } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useMySpecialistProfile } from "@/features/specialist/use-specialist";
import { CARD_SHADOW } from "@/lib/shadows";
import { useThemeColors } from "@/lib/use-theme-color";

export function SpecialistCard({ userId, value }: { userId: string; value?: string }) {
  const router = useRouter();
  const tc = useThemeColors(["accent", "on-accent", "mute", "success"]);
  const { data: user } = useUserRecord(userId);
  const categories = useMyMasterCategories(userId);
  const profile = useMySpecialistProfile(userId);

  const hasCategories = (categories.data ?? []).length > 0;
  const openHub = () => router.push("/profile/specialist" as never);
  const openCategories = () => router.push("/profile/specialist/categories" as never);

  // Пока категории грузятся — компактный вид, без мигания чек-листа.
  if (hasCategories || categories.isLoading) {
    return (
      <View className="mb-7 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? `Профиль специалиста, ${value}` : "Профиль специалиста"}
          onPress={openHub}
          className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-surface-card px-4 py-3.5 active:opacity-80"
          style={CARD_SHADOW}
        >
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent">
            <Wrench size={22} weight="bold" color={tc["on-accent"]} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText weight="semibold" className="text-ios-body text-ink">
              Профиль специалиста
            </AppText>
            <AppText className="text-ios-subheadline text-mute" numberOfLines={1}>
              {value ?? "Категории, о себе, фото работ"}
            </AppText>
          </View>
          <CaretRight size={18} weight="bold" color={tc.mute} />
        </Pressable>
      </View>
    );
  }

  const hasName = !!(user?.first_name?.trim() || user?.last_name?.trim());
  const bio = profile.data?.bio;
  const steps = [
    { done: hasName, title: "Имя", optional: false },
    { done: false, title: "Категории — обязательно", optional: false },
    { done: !!bio?.trim(), title: "О себе — по желанию", optional: true },
  ];

  return (
    <View className="mb-7 px-4">
      <View className="rounded-2xl bg-surface-card p-4" style={CARD_SHADOW}>
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent">
            <Wrench size={22} weight="bold" color={tc["on-accent"]} />
          </View>
          <AppText weight="bold" className="min-w-0 flex-1 text-ios-title2 text-ink">
            Работайте специалистом
          </AppText>
        </View>
        <AppText className="mt-3 text-ios-subheadline text-body">
          Откликаться на задания можно сразу. Выберите свои категории — и клиенты найдут вас в
          «Специалистах».
        </AppText>
        <View className="mt-3 gap-2" accessibilityRole="list">
          {steps.map((s) => (
            <View key={s.title} className="flex-row items-center gap-2">
              {s.done ? (
                <CheckCircle size={20} weight="fill" color={tc.success} />
              ) : (
                <Circle size={20} weight="regular" color={tc.mute} />
              )}
              <AppText className={`text-ios-subheadline ${s.done ? "text-mute" : "text-ink"}`}>
                {s.title}
              </AppText>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openCategories}
          className="mt-4 min-h-12 items-center justify-center rounded-pill bg-accent px-4 active:opacity-85"
        >
          <AppText weight="semibold" className="text-ios-body text-on-accent">
            Выбрать категории
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={openHub}
          className="mt-1 min-h-11 items-center justify-center active:opacity-60"
        >
          <AppText weight="medium" className="text-ios-subheadline text-accent">
            Весь профиль специалиста
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
