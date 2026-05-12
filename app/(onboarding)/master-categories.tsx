import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useSetMasterCategories } from "@/features/master-categories/use-set-categories";

const MAX_CATEGORIES = 5;

export default function MasterCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // mode=onboarding → шаг визарда: save → push на photo. Иначе settings-режим:
  // save → router.back(). Видимая разница: progress-индикатор сверху, скрытая
  // back-кнопка, обязательный выбор ≥1 категории, кнопка "Продолжить".
  const isOnboarding = mode === "onboarding";

  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: visible, isLoading: visibleLoading } = useVisibleCategories();
  const { data: myCats, isLoading: myCatsLoading } = useMyMasterCategories(userId);
  const setCategories = useSetMasterCategories();

  // Локальный selected — инициализируется из myCats при первой загрузке
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && myCats) {
      setSelected(new Set(myCats.map((c) => c.l2_id)));
      setHydrated(true);
    }
  }, [myCats, hydrated]);

  const toggleCategory = (l2Id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(l2Id)) {
        next.delete(l2Id);
      } else if (next.size < MAX_CATEGORIES) {
        next.add(l2Id);
      }
      return next;
    });
  };

  const onSave = async () => {
    if (!userId) return;
    try {
      await setCategories.mutateAsync({
        userId,
        l2Ids: Array.from(selected),
      });
      if (isOnboarding) {
        router.push("/(onboarding)/master-photo");
      } else {
        router.back();
      }
    } catch (_e) {
      // Ошибка отрендерится через setCategories.error ниже
    }
  };

  const isBusy = setCategories.isPending;
  const error = setCategories.error?.message;
  const initialLoading = visibleLoading || myCatsLoading;
  const reachedLimit = selected.size >= MAX_CATEGORIES;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar: в onboarding — progress, в settings — back. */}
      {isOnboarding ? (
        <View className="py-4">
          <OnboardingProgress step={2} total={4} />
        </View>
      ) : (
        <View className="flex-row items-center px-3 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
          >
            <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pb-6">
          <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
            Ваши категории
          </AppText>
          <AppText className="mt-2 text-body-md text-muted">
            Выберите до {MAX_CATEGORIES} категорий — клиенты увидят вас в каждой.
          </AppText>
          <AppText className="mt-1 text-caption text-muted-soft">
            Выбрано: {selected.size} / {MAX_CATEGORIES}
          </AppText>
        </View>

        {initialLoading && (
          <View className="items-center px-6">
            <ActivityIndicator />
          </View>
        )}

        {visible && hydrated && (
          <View className="gap-2 px-6">
            {visible.map((cat) => {
              const isSelected = selected.has(cat.id);
              const isDisabled = !isSelected && reachedLimit;
              return (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isDisabled || isBusy }}
                  disabled={isDisabled || isBusy}
                  onPress={() => toggleCategory(cat.id)}
                  className={`flex-row items-center justify-between rounded-md border p-4 ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : isDisabled
                        ? "border-hairline bg-surface-2 opacity-50"
                        : "border-hairline bg-canvas active:opacity-70"
                  }`}
                >
                  <AppText
                    weight={isSelected ? "semibold" : "medium"}
                    className={`flex-1 text-body-md ${isSelected ? "text-accent" : "text-ink"}`}
                  >
                    {cat.name_ru}
                  </AppText>
                  {isSelected && <Check size={20} strokeWidth={2.25} color="#2563eb" />}
                </Pressable>
              );
            })}
          </View>
        )}

        {error && (
          <View className="mt-4 px-6">
            <AppText weight="medium" className="text-caption text-error">
              {error}
            </AppText>
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom CTA. В onboarding — обязательный выбор ≥1 категории. */}
      <View
        className="border-hairline-soft border-t bg-canvas px-6 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          accessibilityRole="button"
          disabled={isBusy || !userId || initialLoading || (isOnboarding && selected.size === 0)}
          onPress={onSave}
          className={`h-12 items-center justify-center rounded-md ${
            !isBusy && userId && !initialLoading && !(isOnboarding && selected.size === 0)
              ? "bg-primary active:opacity-80"
              : "bg-surface-3"
          }`}
        >
          <AppText weight="semibold" className="text-button text-on-primary">
            {isBusy ? "Сохраняем..." : isOnboarding ? "Продолжить" : "Сохранить"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
