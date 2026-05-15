// /orders/search — глобальный поиск заявок для мастера.
//
// В отличие от /orders → таб «Новые» (только моя категории), здесь
// показываются ВСЕ open-orders сайта. Мастер может фильтровать
// по категориям, искать по тексту с раскладка-fix, сортировать.
//
// Эталон UX: Avito Услуги «лента» / Profi.ru «биржа заявок».

import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, SlidersHorizontal } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

type SortMode = "newest" | "urgent";

export default function OrdersSearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const goBack = useSafeBack("/" as const);

  const inkColor = useThemeColor("ink");
  const muteColor = useThemeColor("mute");
  const onPrimaryColor = useThemeColor("on-primary");

  // Скрываем TabBar — full-screen search experience.
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );

  // Локальные state'ы фильтров (search-input убран по фидбеку
  // user 2026-05-15 — фильтрация только через категории + сортировка).
  const [selectedL2s, setSelectedL2s] = useState<Set<string>>(new Set());
  const [selectedL1, setSelectedL1] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Загружаем все open-orders + опц. фильтр по выбранным L2.
  const l2IdsArr = selectedL2s.size > 0 ? Array.from(selectedL2s) : null;
  const {
    data: feed,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllOpenOrders({ userId, l2Ids: l2IdsArr, sort });

  const allOrders = (feed?.pages ?? []).flatMap((p) => p.rows);

  // Категории L1 + L2 для chip-фильтра.
  const { data: l1List } = useCategoriesL1();
  const { data: l2List } = useVisibleCategories();
  // L2 в выбранной L1-группе (для drill-down).
  const l2InSelectedL1 = useMemo(() => {
    if (!selectedL1 || !l2List) return l2List ?? [];
    return l2List.filter((cat) => cat.l1_id === selectedL1);
  }, [selectedL1, l2List]);

  // Раньше здесь была фильтрация по тексту с раскладка-fix — убрана
  // вместе с search-input (фидбек 2026-05-15). Фильтрация — только
  // через выбранные L2 категории (передаются прямо в useAllOpenOrders).
  const filtered = allOrders;

  const toggleL2 = (l2Id: string) => {
    setSelectedL2s((prev) => {
      const next = new Set(prev);
      if (next.has(l2Id)) next.delete(l2Id);
      else next.add(l2Id);
      return next;
    });
  };

  const clearAllFilters = () => {
    setSelectedL2s(new Set());
    setSelectedL1(null);
    setSort("newest");
  };

  const hasActiveFilters = selectedL2s.size > 0 || sort !== "newest";

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Header: back + title + filter toggle */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={inkColor} />
        </Pressable>
        <AppText weight="bold" className="ml-1 flex-1 text-title-lg text-ink">
          Поиск заказов
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Фильтры"
          onPress={() => setFiltersOpen((v) => !v)}
          hitSlop={8}
          className={`h-10 px-3 flex-row items-center gap-1.5 rounded-pill border active:opacity-70 ${
            hasActiveFilters ? "border-ink bg-ink" : "border-hairline bg-canvas"
          }`}
        >
          <SlidersHorizontal
            size={14}
            strokeWidth={2}
            color={hasActiveFilters ? onPrimaryColor : inkColor}
          />
          <AppText
            weight="medium"
            className={`text-caption ${hasActiveFilters ? "text-on-primary" : "text-ink"}`}
          >
            Фильтры
          </AppText>
        </Pressable>
      </View>

      {/* Search-input убран по фидбеку user 2026-05-15 — фильтрация только
          через категории + сортировку. */}

      {/* Expandable filters block */}
      {filtersOpen ? (
        <View className="border-hairline-soft border-y bg-canvas-soft px-4 py-3 gap-3">
          {/* Сортировка */}
          <View>
            <AppText weight="medium" className="text-caption uppercase tracking-wider text-muted">
              Сортировка
            </AppText>
            <View className="mt-2 flex-row gap-2">
              <SortChip
                label="Новые сверху"
                selected={sort === "newest"}
                onPress={() => setSort("newest")}
              />
              <SortChip
                label="Срочные сверху"
                selected={sort === "urgent"}
                onPress={() => setSort("urgent")}
              />
            </View>
          </View>

          {/* L1 группы */}
          <View>
            <AppText weight="medium" className="text-caption uppercase tracking-wider text-muted">
              Раздел
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
            >
              <SortChip
                label="Все"
                selected={selectedL1 == null}
                onPress={() => setSelectedL1(null)}
              />
              {(l1List ?? []).map((l1) => (
                <SortChip
                  key={l1.id}
                  label={l1.name_ru}
                  selected={selectedL1 === l1.id}
                  onPress={() => setSelectedL1(selectedL1 === l1.id ? null : l1.id)}
                />
              ))}
            </ScrollView>
          </View>

          {/* L2 chips (multi-select) — сужены до выбранной L1 */}
          <View>
            <View className="flex-row items-center justify-between">
              <AppText weight="medium" className="text-caption uppercase tracking-wider text-muted">
                Категории {selectedL2s.size > 0 ? `(${selectedL2s.size})` : ""}
              </AppText>
              {selectedL2s.size > 0 ? (
                <Pressable onPress={() => setSelectedL2s(new Set())} hitSlop={8}>
                  <AppText weight="medium" className="text-caption text-link">
                    Сбросить
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {l2InSelectedL1.map((cat) => (
                <SortChip
                  key={cat.id}
                  label={cat.name_ru}
                  selected={selectedL2s.has(cat.id)}
                  onPress={() => toggleL2(cat.id)}
                />
              ))}
            </View>
          </View>

          {hasActiveFilters ? (
            <Pressable
              onPress={clearAllFilters}
              accessibilityRole="button"
              hitSlop={8}
              className="self-start active:opacity-70"
            >
              <AppText weight="medium" className="text-body-sm text-link">
                Сбросить все фильтры
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Result list */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View className="mt-8 items-center">
            <ActivityIndicator />
          </View>
        ) : error ? (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              {error.message}
            </AppText>
          </View>
        ) : filtered.length === 0 ? (
          <View className="mt-12 px-6 items-center">
            <AppText weight="semibold" className="text-body-md text-ink">
              Ничего не нашли
            </AppText>
            <AppText className="mt-1 text-center text-body-sm text-muted">
              {hasActiveFilters
                ? "Попробуйте изменить фильтры или поисковый запрос."
                : "Сейчас на сайте нет открытых заявок."}
            </AppText>
            {hasActiveFilters ? (
              <Pressable
                onPress={clearAllFilters}
                accessibilityRole="button"
                hitSlop={8}
                className="mt-3 active:opacity-70"
              >
                <AppText weight="medium" className="text-body-sm text-link">
                  Сбросить все фильтры
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View className="mt-4 gap-3 px-4">
            {filtered.map((o) => (
              <OrderRow
                key={o.id}
                id={o.id}
                title={o.title}
                categoryName={o.l2?.name_ru ?? o.l2_id}
                categoryIcon={o.l2?.icon ?? null}
                categoryL2Id={o.l2_id}
                cityName={o.city?.name ?? o.city_id ?? "Вся Ингушетия"}
                district={o.district}
                urgency={o.urgency}
                responsesCount={o.responses_count}
                createdAt={o.created_at}
                status="open"
                onPress={() => router.push(`/(tabs)/orders/${o.id}` as never)}
              />
            ))}

            {hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                disabled={isFetchingNextPage}
                onPress={() => fetchNextPage()}
                className="mt-2 h-11 flex-row items-center justify-center rounded-md border border-hairline active:opacity-70"
              >
                {isFetchingNextPage ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <AppText weight="medium" className="text-button text-body">
                    Показать ещё
                  </AppText>
                )}
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------------

function SortChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-pill border px-3 py-1.5 active:opacity-70 ${
        selected ? "border-ink bg-ink" : "border-hairline bg-canvas hover:bg-surface-2"
      }`}
    >
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-caption ${selected ? "text-on-primary" : "text-ink"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
