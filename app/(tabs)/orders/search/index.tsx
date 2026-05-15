// /orders/search — глобальный поиск заявок для мастера.
//
// В отличие от /orders → таб «Новые» (только моя категории), здесь
// показываются ВСЕ open-orders сайта. Фильтры выбираются на отдельном
// full-screen экране /orders/search/filters (не inline) — больше места,
// лучше UX. State фильтров — в Zustand-сторе useOrdersSearchFiltersStore,
// чтобы переживать переход на /filters и /category-select.
//
// **Это таб (центральная кнопка нижней панели для мастера),** не
// detail-экран. Поэтому:
//   - НЕ скрываем TabBar (`useTabBarVisibility` НЕ вызываем).
//   - НЕ показываем back-кнопку в хедере (`<ScreenHeader>` без `onBack`).
//   - Подсветка таба «Поиск заказов» в TabBar — по pathname (см. TabBar.tsx).
// Перемещение между табами — стандартным способом, через нижнее меню.
//
// **Стандарт хедера:** <ScreenHeader> (height 64, display-md title, h-12 back,
// optional pill-action). См. UI_PATTERNS.md → раздел 3.1.
//
// **Полный кук-бук UI:** UI_PATTERNS.md (архетипы экранов, building blocks).
//
// Эталон UX: Avito Услуги «лента» / Profi.ru «биржа заявок».

import { useRouter } from "expo-router";
import { Tray, SlidersHorizontal, Sparkle } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useThemeColor } from "@/lib/use-theme-color";

export default function OrdersSearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const accentColor = useThemeColor("accent");

  // Фильтры — из Zustand-стора (общие с /orders/search/filters).
  // l1Id удалён 2026-05-15 (фидбэк user: убрать «Разделы» из фильтров,
  // оставить только L2 категории).
  const filters = useOrdersSearchFiltersStore();
  const { l2Ids, sort, clearAll } = filters;
  const initFromMasterCategories = useOrdersSearchFiltersStore(
    (s) => s.initFromMasterCategories,
  );
  const activeCount = countActiveFilters(filters);
  const hasActiveFilters = activeCount > 0;

  // 2026-05-15: при первом заходе мастера подставляем в фильтры его
  // профильные категории (master_categories) — он сразу видит релевантные
  // заявки. Идемпотентно: повторно для того же userId не перезаливаем,
  // чтобы «Сбросить все фильтры» работал по ожиданию пользователя.
  const myMasterCategories = useMyMasterCategories(userId);
  useEffect(() => {
    if (!userId || !myMasterCategories.data) return;
    initFromMasterCategories(
      userId,
      myMasterCategories.data
        .map((mc) => mc.l2_id)
        .filter((id): id is string => !!id),
    );
  }, [userId, myMasterCategories.data, initFromMasterCategories]);

  const effectiveL2Ids = l2Ids.length > 0 ? l2Ids : null;

  const {
    data: feed,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllOpenOrders({ userId, l2Ids: effectiveL2Ids, sort });

  const allOrders = (feed?.pages ?? []).flatMap((p) => p.rows);

  // Animated fade-in списка (UI_PATTERNS §3.7) — opacity 0→1 за 280ms когда
  // данные пришли. Skeleton → real list переход не должен быть «дёрганый».
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading && !error && allOrders.length > 0) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, error, allOrders.length, opacity]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title="Поиск заказов"
        rightAction={{
          label: "Фильтры",
          Icon: SlidersHorizontal,
          onPress: () =>
            router.push("/(tabs)/orders/search/filters" as never),
          active: hasActiveFilters,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <OrderRowsSkeleton count={5} />
        ) : error ? (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              {error.message}
            </AppText>
          </View>
        ) : allOrders.length === 0 ? (
          <EmptyState
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAll}
            accentColor={accentColor}
          />
        ) : (
          <Animated.View style={{ opacity }} className="mt-2">
            {allOrders.map((o) => (
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
                showResponsesCount={false}
                budgetKind={o.budget_kind}
                budgetValue={o.budget_value}
                description={o.description}
                onPress={() =>
                  router.push(`/(tabs)/orders/${o.id}` as never)
                }
              />
            ))}

            {hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                disabled={isFetchingNextPage}
                onPress={() => fetchNextPage()}
                className="mx-5 mt-4 h-11 flex-row items-center justify-center rounded-md border border-hairline active:opacity-70"
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

          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// EmptyState — hero-иллюстрация (tinted bg + декоративные фигуры + центр-иконка)
// + заголовок + объяснение + CTA. Структура из UI_PATTERNS §3.5 + §3.8.
// ============================================================================

interface EmptyStateProps {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  accentColor: string;
}

function EmptyState({
  hasActiveFilters,
  onClearFilters,
  accentColor,
}: EmptyStateProps) {
  return (
    <View className="mt-10 items-center px-6">
      {/* Hero-иллюстрация: sky-tint фон + 3 декоративные фигуры + центр-иконка */}
      <View
        className="h-32 w-32 items-center justify-center rounded-2xl bg-badge-sky relative overflow-hidden"
      >
        <View
          className="absolute rounded-full bg-canvas"
          style={{ top: -20, left: -16, width: 60, height: 60, opacity: 0.35 }}
        />
        <View
          className="absolute rounded-full bg-canvas"
          style={{ bottom: -14, right: -10, width: 48, height: 48, opacity: 0.45 }}
        />
        <View
          className="absolute rounded-md bg-canvas"
          style={{
            top: 18,
            right: 18,
            width: 16,
            height: 16,
            opacity: 0.55,
            transform: [{ rotate: "12deg" }],
          }}
        />
        {/* Центральная иконка */}
        <View className="h-16 w-16 items-center justify-center rounded-full bg-canvas">
          {hasActiveFilters ? (
            <Sparkle size={28} weight="bold" color={accentColor} />
          ) : (
            <Tray size={28} weight="bold" color={accentColor} />
          )}
        </View>
      </View>

      <AppText
        weight="bold"
        className="mt-6 text-center text-title-lg text-ink"
      >
        {hasActiveFilters ? "Под фильтры ничего не нашлось" : "Открытых заявок пока нет"}
      </AppText>
      <AppText className="mt-2 text-center text-body-sm text-muted">
        {hasActiveFilters
          ? "Попробуйте сбросить или изменить фильтры — на сайте есть и другие заявки."
          : "Скоро здесь появятся свежие заявки клиентов. Загляните позже или расширьте категории в профиле."}
      </AppText>

      {hasActiveFilters ? (
        <Pressable
          onPress={onClearFilters}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-4 h-10 flex-row items-center justify-center rounded-pill border border-hairline bg-canvas px-4 active:opacity-70"
        >
          <AppText weight="semibold" className="text-button text-ink">
            Сбросить фильтры
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
