// /orders/search — лента открытых заданий для исполнителя.
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

import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { SlidersHorizontal, Sparkle, Tray } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useMyResponses } from "@/features/orders/use-my-responses";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { useThemeColor } from "@/lib/use-theme-color";

export default function OrdersSearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const accentColor = useThemeColor("accent");

  // active_role нужен чтобы решить, показывать ли entry «Мои отклики».
  // Кнопка имеет смысл только для мастера: у клиента откликов не бывает.

  // Фильтры — из Zustand-стора (общие с /orders/search/filters).
  // l1Id удалён 2026-05-15 (фидбэк user: убрать «Разделы» из фильтров,
  // оставить только L2 категории).
  const filters = useOrdersSearchFiltersStore();
  const { l2Ids, cityId, district, clearAll } = filters;
  const activeCount = countActiveFilters(filters);
  const hasActiveFilters = activeCount > 0;

  // 2026-05-21: автоподстановка фильтра по master_categories ОТКЛЮЧЕНА.
  // Раньше при первом заходе мастера в фильтр автоматически подставлялись
  // его L2-категории (master_categories) → он видел только релевантные.
  // Проблема: если у мастера 1 категория, а open-orders в БД в других
  // категориях — он видел «Открытых заявок нет» (ложный empty state).
  // Также клиент с центральной кнопкой «Смотреть задания» попадает сюда без
  // master_categories. Поэтому сам переход на экран никогда не меняет фильтры.
  //
  // Новое поведение: показываем ВСЕ open-orders по умолчанию. Если мастер
  // хочет отфильтровать — нажимает «Фильтры» и сам выбирает категории
  // (там можно одним тапом «применить мои категории» — отдельная задача).

  const effectiveL2Ids = l2Ids.length > 0 ? l2Ids : null;

  // P1-3 (LAUNCH_READINESS): при заходе мастера в /orders/search сбрасываем
  // unread-badge на TabBar (RPC mark_feed_seen обновляет
  // users.feed_last_seen_at = now()). До этого badge только рос.
  const markSeen = useMarkFeedSeen(userId);
  const markSeenMutate = markSeen.mutate;
  useEffect(() => {
    if (!userId) return;
    markSeenMutate();
  }, [userId, markSeenMutate]);

  const {
    data: feed,
    isLoading,
    error,
    refetch,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllOpenOrders({ userId, l2Ids: effectiveL2Ids, cityId, district });

  const displayedOrders = (feed?.pages ?? []).flatMap((p) => p.rows);

  // Сет order_id, на которые мастер уже откликнулся (любой статус кроме
  // withdrawn). Используется для маркера «Вы откликнулись» в OrderRow,
  // чтобы мастер сразу видел в фиде поиска, какие заявки он уже трогал.
  // Withdrawn исключаем — отозванный отклик не считается активным.
  const myResponsesQ = useMyResponses(userId);
  const respondedOrderIds = new Set(
    (myResponsesQ.data ?? [])
      .filter((r) => r.response.status !== "withdrawn")
      .map((r) => r.response.order_id),
  );

  // Animated fade-in списка (UI_PATTERNS §3.7) — opacity 0→1 за 280ms когда
  // данные пришли. Skeleton → real list переход не должен быть «дёрганый».
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading && !error && displayedOrders.length > 0) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, error, displayedOrders.length, opacity]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title="Задания"
        rightAction={{
          label: hasActiveFilters ? `Фильтры · ${activeCount}` : "Фильтры",
          Icon: SlidersHorizontal,
          onPress: () => router.push("/orders/search/filters" as never),
          active: hasActiveFilters,
        }}
      />

      {/* Pill «Мои отклики» перенесена отсюда на главную мастера (над секцией
          «Подобрали для вас»). Фидбэк владельца 2026-05-28 (вечер). См.
          src/features/master-view/MyResponsesEntry.tsx. */}

      {isLoading ? (
        <View className="flex-1">
          <OrderRowsSkeleton count={5} />
        </View>
      ) : error ? (
        <View className="flex-1 px-6 pt-6">
          <AppText weight="semibold" className="text-body-md text-ink">
            Не удалось загрузить задания
          </AppText>
          <AppText className="mt-1 text-body-sm text-mute">{error.message}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку заданий"
            disabled={isRefetching}
            onPress={() => void refetch()}
            className="mt-4 min-h-11 self-start items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-sm text-ink">
              {isRefetching ? "Загружаем…" : "Повторить"}
            </AppText>
          </Pressable>
        </View>
      ) : displayedOrders.length === 0 ? (
        <EmptyState
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAll}
          accentColor={accentColor}
        />
      ) : (
        <Animated.View style={{ opacity }} className="flex-1">
          <FlashList
            data={displayedOrders}
            extraData={myResponsesQ.data}
            keyExtractor={(order) => order.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 24 }}
            renderItem={({ item: o }) => (
              <OrderRow
                id={o.id}
                title={o.title}
                categoryName={o.l2?.name_ru ?? o.l2_id}
                categoryIcon={o.l2?.icon ?? null}
                categoryL2Id={o.l2_id}
                cityName={o.city?.name ?? o.city_id ?? "Вся Ингушетия"}
                district={o.district}
                urgency={o.urgency}
                preferredDate={o.preferred_date}
                responsesCount={o.responses_count}
                createdAt={o.created_at}
                showResponsesCount={false}
                budgetKind={o.budget_kind}
                budgetValue={o.budget_value}
                description={o.description}
                coverUrl={o.photo_urls?.[0] ?? null}
                photosCount={o.photo_urls?.length ?? 0}
                alreadyResponded={respondedOrderIds.has(o.id)}
                onPress={() => router.push(`/orders/${o.id}` as never)}
              />
            )}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="h-16 items-center justify-center">
                  <ActivityIndicator size="small" />
                </View>
              ) : null
            }
          />
        </Animated.View>
      )}
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

function EmptyState({ hasActiveFilters, onClearFilters, accentColor }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center px-6 pt-10">
      {/* Hero-иллюстрация: sky-tint фон + 3 декоративные фигуры + центр-иконка */}
      <View className="h-32 w-32 items-center justify-center rounded-2xl bg-badge-sky relative overflow-hidden">
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

      <AppText weight="bold" className="mt-6 text-center text-title-lg text-ink">
        {hasActiveFilters ? "Под фильтры ничего не нашлось" : "Открытых заданий пока нет"}
      </AppText>
      <AppText className="mt-2 text-center text-body-sm text-muted">
        {hasActiveFilters
          ? "Попробуйте сбросить или изменить фильтры — в приложении есть и другие задания."
          : "Скоро здесь появятся свежие задания клиентов. Загляните позже или расширьте категории в профиле."}
      </AppText>

      {hasActiveFilters ? (
        <Pressable
          onPress={onClearFilters}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-4 min-h-11 flex-row items-center justify-center rounded-pill border border-hairline bg-canvas px-4 active:opacity-70"
        >
          <AppText weight="semibold" className="text-button text-ink">
            Сбросить фильтры
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
