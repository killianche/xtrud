// /find — лента открытых заданий для исполнителя.
//
// До 2026-08-30 жил как «Смотреть заказы» — псевдо-таб в центре TabBar,
// физически под /orders/search. Стал полноценным 4-м табом мастера «Найти
// задание» (редизайн главной + нижней навигации, фидбэк владельца): реальный
// Tabs.Screen вместо кастомного Pressable, без ручного mutex-подсвечивания.
//
// Показываются ВСЕ open-orders сайта. Фильтры выбираются на отдельном
// full-screen экране /find/filters (не inline) — больше места, лучше UX.
// State фильтров — в Zustand-сторе useOrdersSearchFiltersStore, чтобы
// переживать переход на /filters и /category-select.
//
// **Это таб (4-й таб нижней панели для мастера),** не detail-экран. Поэтому:
//   - НЕ скрываем TabBar (`useTabBarVisibility` НЕ вызываем).
//   - НЕ показываем back-кнопку в хедере (`<ScreenHeader>` без `onBack`).
//
// **Стандарт хедера:** <ScreenHeader> (height 64, display-md title, h-12 back,
// optional pill-action). См. UI_PATTERNS.md → раздел 3.1.
//
// **Полный кук-бук UI:** UI_PATTERNS.md (архетипы экранов, building blocks).
//
// Эталон UX: Avito Услуги «лента» / Profi.ru «биржа заявок».

import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { MapPin, Sparkle, SquaresFour, Tray } from "phosphor-react-native";
import { type RefObject, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  type FlatList,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { FilterChip, LargeTitleBar, LargeTitleBlock, useLargeTitle } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { useMyRespondedOrderIds } from "@/features/orders/use-my-responded-order-ids";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { describeQueryError } from "@/lib/describe-query-error";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColor } from "@/lib/use-theme-color";

const EMPTY_IDS: ReadonlySet<string> = new Set();

export default function FindScreen() {
  const tabBarSpace = useTabBarSpace();
  const large = useLargeTitle();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const accentColor = useThemeColor("accent");

  // active_role нужен чтобы решить, показывать ли entry «Мои отклики».
  // Кнопка имеет смысл только для мастера: у клиента откликов не бывает.

  // Фильтры — из Zustand-стора (общие с /find/filters).
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

  // Подписи чипов — из каталога и городов (без сети берётся бандл).
  const categoriesQ = useVisibleCategories();
  const citiesQ = useCities();
  const categoryChipLabel = (() => {
    if (l2Ids.length === 0) return "Категория";
    const first = categoriesQ.data?.find((c) => c.id === l2Ids[0])?.name_ru ?? "Категория";
    return l2Ids.length > 1 ? `${first} +${l2Ids.length - 1}` : first;
  })();
  const locationChipLabel = cityId
    ? (citiesQ.data?.find((c) => c.id === cityId)?.name ?? "Город")
    : district || "Вся Ингушетия";

  // P1-3 (LAUNCH_READINESS): при заходе мастера в /find сбрасываем
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
  // Только id заданий с моим откликом — без полного списка откликов с JOIN.
  const myResponsesQ = useMyRespondedOrderIds(userId);
  const respondedOrderIds = myResponsesQ.data ?? EMPTY_IDS;

  // Animated fade-in списка (UI_PATTERNS §3.7) — opacity 0→1 за 280ms когда
  // данные пришли. Skeleton → real list переход не должен быть «дёрганый».
  const opacity = useRef(new Animated.Value(0)).current;

  // Повторный тап по вкладке «Найти задание» — к началу ленты.
  const listRef = useRef<FlashListRef<OrderWithRefs>>(null);
  const resetCounter = useTabScrollResetCounter("find");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
  }, [resetCounter]);
  useEffect(() => {
    if (!isLoading && !error && displayedOrders.length > 0) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, error, displayedOrders.length, opacity]);

  // Крупный заголовок первым, под ним строка фильтров — как у Apple под
  // large title (DECISION владельца 2026-09-06, вечер: «заголовок — в самом
  // верху, где пустое место, фильтры под ним»). Чипы показывают выбранное и
  // открывают системные шторки; отдельного экрана «Фильтры» нет.
  const header = (
    <>
      <LargeTitleBlock title="Задания" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
      >
        <FilterChip
          label={categoryChipLabel}
          Icon={SquaresFour}
          active={l2Ids.length > 0}
          onPress={() => router.push("/find/category-select" as never)}
        />
        <FilterChip
          label={locationChipLabel}
          Icon={MapPin}
          active={!!cityId || !!district}
          onPress={() => router.push("/find/location-select" as never)}
        />
        {hasActiveFilters ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сбросить фильтры"
            onPress={clearAll}
            className="h-11 justify-center px-2 active:opacity-60"
          >
            <AppText className="text-ios-callout text-accent">Сбросить</AppText>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );

  return (
    <View className="flex-1 bg-surface-page">
      {/* Закреплённая строка — только компактный заголовок при прокрутке.
          Крупный заголовок и чипы фильтров — в начале списка (`header`). */}
      <LargeTitleBar
        title="Задания"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />

      {/* Pill «Мои отклики» перенесена отсюда на главную мастера (над секцией
          «Подобрали для вас»). Фидбэк владельца 2026-05-28 (вечер). См.
          src/features/master-view/MyResponsesEntry.tsx. */}

      {isLoading ? (
        <View className="flex-1" style={{ paddingTop: large.contentTop }}>
          {header}
          <OrderRowsSkeleton count={5} />
        </View>
      ) : error ? (
        <View className="flex-1" style={{ paddingTop: large.contentTop }}>
          {header}
          <View className="px-6 pt-4">
            {/* Показываем человеческий текст, а не `error.message`: там
              техническая строка вроде «FetchError: …» (DECISION 2026-09-03). */}
            <AppText weight="bold" className="text-title-lg text-ink">
              {describeQueryError(error).title}
            </AppText>
            <AppText className="mt-1 text-body-md text-body">
              {describeQueryError(error).hint}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Повторить загрузку заданий"
              disabled={isRefetching}
              onPress={() => void refetch()}
              className="mt-5 min-h-12 self-start items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:bg-canvas-soft"
            >
              <AppText weight="semibold" className="text-body-md text-ink">
                {isRefetching ? "Загружаем…" : "Повторить"}
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : displayedOrders.length === 0 ? (
        <View className="flex-1" style={{ paddingTop: large.contentTop }}>
          {header}
          <EmptyState
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAll}
            accentColor={accentColor}
          />
        </View>
      ) : (
        <Animated.View style={{ opacity }} className="flex-1">
          <FlashList
            ref={listRef}
            data={displayedOrders}
            extraData={myResponsesQ.data}
            keyExtractor={(order) => order.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
            onScroll={large.onScroll}
            scrollEventThrottle={16}
            renderScrollComponent={Animated.ScrollView as never}
            ListHeaderComponent={header}
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
                contactMode={o.contact_mode}
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
//
// Формулировка для «заданий вообще нет» (без активных фильтров) — единая с
// блоком «Актуальные задания» на главной мастера (OpenOrdersHighlights):
// один факт («открытых заданий сейчас 0») не должен иметь двух разных
// текстов на разных экранах.
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

      <AppText weight="bold" className="mt-6 text-center text-display-sm text-ink">
        {hasActiveFilters ? "Под фильтры ничего не нашлось" : "Открытых заданий сейчас нет"}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">
        {hasActiveFilters
          ? "Попробуйте сбросить или изменить фильтры — в приложении есть и другие задания."
          : "Задания появляются здесь по мере публикации. Загляните позже."}
      </AppText>

      {hasActiveFilters ? (
        <Pressable
          onPress={onClearFilters}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-6 min-h-12 flex-row items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:opacity-70"
        >
          <AppText weight="semibold" className="text-body-md text-ink">
            Сбросить фильтры
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
