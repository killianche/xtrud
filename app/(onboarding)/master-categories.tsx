// Master onboarding step: выбор L2-категорий.
//
// P0-3 (research/MASTER_ACCOUNT_PLAN.md): редизайн — раньше плоский
// chip-list из 32 опций без поиска и иерархии. Теперь:
//   - sticky search input (чипы фильтруются по name_ru)
//   - группировка по L1 (10 разделов × 64 L2 = читаемая иерархия)
//   - chip multi-select с лимитом 5
//   - sticky bottom CTA «Продолжить» (onboarding) или «Сохранить» (settings)
//
// Эталон UX: Яндекс Услуги (поиск + иерархия), Профи.ру (группы + категории),
// LocationFilterSheet (внутри проекта — этот же паттерн для городов/сёл).
// Lazyweb-референсы: mercury (search + categorized list), klarna (multi-select
// chips), bubbles-and-friends (group → category bottom sheet).

import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft, Check, MagnifyingGlass, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useExitOnboarding } from "@/features/auth/use-exit-onboarding";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import {
  useVisibleCategories,
  type VisibleCategory,
} from "@/features/categories/use-visible-categories";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useSetMasterCategories } from "@/features/master-categories/use-set-categories";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

const MAX_CATEGORIES = 5;

export default function MasterCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // mode=onboarding → шаг визарда: save → push на photo. Иначе settings-режим:
  // save → goBack(). Видимая разница: progress-индикатор сверху, скрытая
  // back-кнопка, обязательный выбор ≥1 категории, кнопка "Продолжить".
  const isOnboarding = mode === "onboarding";
  // safeBack — fallback /(tabs)/profile, потому что settings-режим открывается
  // из /profile, и при cross-stack push'е expo-router теряет history (фикс
  // фидбэка user 2026-05-15 «back из категорий ведёт на главную»).
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { exit: exitOnboarding } = useExitOnboarding();

  const { data: visible, isLoading: visibleLoading } = useVisibleCategories();
  const { data: l1List, isLoading: l1Loading } = useCategoriesL1();
  const { data: myCats, isLoading: myCatsLoading } = useMyMasterCategories(userId);
  const setCategories = useSetMasterCategories();
  const tc = useThemeColors(["ink", "accent", "mute", "on-primary"]);

  // Локальный selected — инициализируется из myCats при первой загрузке
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");

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
        goBack();
      }
    } catch (_e) {
      // Ошибка отрендерится через setCategories.error ниже
    }
  };

  // Группировка L2 по L1 — для иерархического показа.
  const groupedByL1 = useMemo(() => {
    if (!visible || !l1List) return null;
    const byL1 = new Map<string, VisibleCategory[]>();
    for (const cat of visible) {
      const list = byL1.get(cat.l1_id) ?? [];
      list.push(cat);
      byL1.set(cat.l1_id, list);
    }
    // Возвращаем в порядке sort_order L1, исключаем пустые группы
    return l1List
      .map((l1) => ({ l1, items: byL1.get(l1.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [visible, l1List]);

  // Поиск — flat-выдача всех L2 у которых name_ru содержит query.
  const filteredFlat = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !visible) return null;
    return visible.filter((c) => c.name_ru.toLowerCase().includes(q));
  }, [search, visible]);

  const isBusy = setCategories.isPending;
  const error = setCategories.error?.message;
  const initialLoading = visibleLoading || myCatsLoading || l1Loading;
  const reachedLimit = selected.size >= MAX_CATEGORIES;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar: в onboarding — progress + кнопка «Отмена», в settings — back. */}
      {isOnboarding ? (
        <View className="py-4">
          <OnboardingProgress step={2} total={3} onCancel={exitOnboarding} />
        </View>
      ) : (
        <View className="flex-row items-center px-3 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={() => goBack()}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
          >
            <CaretLeft size={24} weight="bold" color={tc.ink} />
          </Pressable>
        </View>
      )}

      {/* Header — без subtitle (design-quality §G). Хелпер «Выбрано N из 5» —
          ниже под поиском, он динамический и заменяет статический сабтайтл. */}
      <View className="px-6 pb-3">
        <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
          Ваши категории
        </AppText>
      </View>

      {/* Sticky search + counter row */}
      <View className="px-6 pb-3">
        <View className="flex-row items-center gap-2 rounded-md border border-hairline bg-canvas px-3 h-11">
          <MagnifyingGlass size={16} weight="bold" color={tc.mute} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Найти категорию…"
            placeholderTextColor={tc.mute}
            style={
              {
                flex: 1,
                fontSize: 15,
                color: tc.ink,
                outlineWidth: 0,
                outlineStyle: "none",
              } as object
            }
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              onPress={() => setSearch("")}
              hitSlop={6}
              className="active:opacity-60"
            >
              <X size={14} weight="bold" color={tc.mute} />
            </Pressable>
          ) : null}
        </View>
        <AppText className="mt-2 text-caption text-muted-soft">
          Выбрано {selected.size} из {MAX_CATEGORIES}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {initialLoading && (
          <View className="items-center px-6 py-6">
            <AppText className="text-body-sm text-mute">Загружаем категории…</AppText>
          </View>
        )}

        {/* Активный поиск → flat-выдача матчевших L2 */}
        {hydrated && filteredFlat && (
          <View className="px-6">
            {filteredFlat.length === 0 ? (
              <View className="items-center py-8">
                <AppText className="text-body-sm text-mute">
                  Ничего не найдено по запросу «{search}».
                </AppText>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {filteredFlat.map((cat) => (
                  <CategoryChip
                    key={cat.id}
                    cat={cat}
                    isSelected={selected.has(cat.id)}
                    isDisabled={!selected.has(cat.id) && reachedLimit}
                    isBusy={isBusy}
                    onPress={() => toggleCategory(cat.id)}
                    selectedIconColor={tc.accent}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Без поиска → группы L1 (раскрытые сразу — у нас всего 10 групп
            и 64 L2, не нужно collapse). */}
        {hydrated && !filteredFlat && groupedByL1 && (
          <View className="gap-5">
            {groupedByL1.map(({ l1, items }) => (
              <View key={l1.id} className="px-6">
                <AppText
                  weight="semibold"
                  className="mb-2 text-caption uppercase tracking-wider text-muted"
                >
                  {l1.name_ru}
                </AppText>
                <View className="flex-row flex-wrap gap-2">
                  {items.map((cat) => (
                    <CategoryChip
                      key={cat.id}
                      cat={cat}
                      isSelected={selected.has(cat.id)}
                      isDisabled={!selected.has(cat.id) && reachedLimit}
                      isBusy={isBusy}
                      onPress={() => toggleCategory(cat.id)}
                      selectedIconColor={tc.accent}
                    />
                  ))}
                </View>
              </View>
            ))}
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
          <AppText
            weight="semibold"
            className={`text-button ${
              !isBusy && userId && !initialLoading && !(isOnboarding && selected.size === 0)
                ? "text-on-primary"
                : "text-muted-soft"
            }`}
          >
            {isBusy ? "Сохраняем..." : isOnboarding ? "Продолжить" : "Сохранить"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------

interface CategoryChipProps {
  cat: VisibleCategory;
  isSelected: boolean;
  isDisabled: boolean;
  isBusy: boolean;
  onPress: () => void;
  selectedIconColor: string;
}

function CategoryChip({
  cat,
  isSelected,
  isDisabled,
  isBusy,
  onPress,
  selectedIconColor,
}: CategoryChipProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected, disabled: isDisabled || isBusy }}
      disabled={isDisabled || isBusy}
      onPress={onPress}
      className={`h-11 flex-row items-center gap-1.5 rounded-pill border px-3 ${
        isSelected
          ? "border-accent bg-accent-soft"
          : isDisabled
            ? "border-hairline bg-surface-2 opacity-50"
            : "border-hairline bg-canvas active:opacity-70"
      }`}
    >
      {isSelected ? <Check size={14} weight="fill" color={selectedIconColor} /> : null}
      <AppText
        weight={isSelected ? "semibold" : "medium"}
        className={`text-body-sm ${isSelected ? "text-accent" : "text-ink"}`}
      >
        {cat.name_ru}
      </AppText>
    </Pressable>
  );
}
