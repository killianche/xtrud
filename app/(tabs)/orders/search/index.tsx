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
// optional pill-action). См. DESIGN.md → раздел «UI patterns».
//
// Эталон UX: Avito Услуги «лента» / Profi.ru «биржа заявок».

import { useRouter } from "expo-router";
import { SlidersHorizontal } from "lucide-react-native";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";

export default function OrdersSearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  // Фильтры — из Zustand-стора (общие с /orders/search/filters).
  const filters = useOrdersSearchFiltersStore();
  const { l2Ids, l1Id, sort, clearAll } = filters;
  const activeCount = countActiveFilters(filters);
  const hasActiveFilters = activeCount > 0;

  // Если пользователь выбрал L1 без конкретных L2 — на клиенте сужаем
  // выдачу до всех L2 в этом L1.
  const { data: l2List } = useVisibleCategories();
  const effectiveL2Ids = useMemo(() => {
    if (l2Ids.length > 0) return l2Ids;
    if (l1Id && l2List) {
      return l2List.filter((c) => c.l1_id === l1Id).map((c) => c.id);
    }
    return null;
  }, [l2Ids, l1Id, l2List]);

  const {
    data: feed,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllOpenOrders({ userId, l2Ids: effectiveL2Ids, sort });

  const allOrders = (feed?.pages ?? []).flatMap((p) => p.rows);

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
          <View className="mt-8 items-center">
            <ActivityIndicator />
          </View>
        ) : error ? (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              {error.message}
            </AppText>
          </View>
        ) : allOrders.length === 0 ? (
          <View className="mt-12 px-6 items-center">
            <AppText weight="semibold" className="text-body-md text-ink">
              Ничего не нашли
            </AppText>
            <AppText className="mt-1 text-center text-body-sm text-muted">
              {hasActiveFilters
                ? "Попробуйте изменить фильтры."
                : "Сейчас на сайте нет открытых заявок."}
            </AppText>
            {hasActiveFilters ? (
              <Pressable
                onPress={clearAll}
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
                status="open"
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
