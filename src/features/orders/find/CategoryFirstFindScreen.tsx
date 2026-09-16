/**
 * «Найти задание» — сначала выбор, потом лента (владелец, 2026-09-16: «убрать
 * круглые кнопки фильтра и места; сверху поиск и выбор категории пилюлями;
 * чтобы задания не показывались сразу — человек сначала выбирает категорию;
 * можно показать два-три актуальных»).
 *
 * Как у поиска App Store в iOS 26:
 *   - закреплённая шапка: поле поиска и ряд пилюль «Категория ▾», «Место ▾»;
 *     выбранное значение — прямо в пилюле, «Сбросить» — отдельной пилюлей;
 *   - старт: разделы каталога списком (один тап — задания раздела) и три
 *     свежих задания с кнопкой «Все задания»;
 *   - есть категория, место, запрос или нажато «Все задания» — лента.
 *
 * Откат — флаг find_screen в админке (0205): classic возвращает прежний экран
 * (app/(tabs)/find/index.tsx) без новой сборки.
 */

import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { CaretDown, MagnifyingGlass, MapPin, SquaresFour, X } from "phosphor-react-native";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, type FlatList, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { InsetGroup, InsetRow, LargeTitleBar, SearchField, useLargeTitle } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { searchTerm } from "@/features/orders/search-term";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { useMyRespondedOrderIds } from "@/features/orders/use-my-responded-order-ids";
import { useOrdersFilterLabels } from "@/features/orders/use-orders-filter-labels";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { getCategoryIcon } from "@/lib/category-icons";
import { describeQueryError } from "@/lib/describe-query-error";
import { hapticSelection } from "@/lib/haptics";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

const EMPTY_IDS: ReadonlySet<string> = new Set();
const FRESH_COUNT = 3;

export function CategoryFirstFindScreen() {
  const tabBarSpace = useTabBarSpace();
  const large = useLargeTitle(0);
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["ink", "mute", "accent", "on-accent"]);

  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const query = useOrdersSearchFiltersStore((s) => s.query);
  const browseAll = useOrdersSearchFiltersStore((s) => s.browseAll);
  const setQuery = useOrdersSearchFiltersStore((s) => s.setQuery);
  const setBrowseAll = useOrdersSearchFiltersStore((s) => s.setBrowseAll);
  const setL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  const clearAll = useOrdersSearchFiltersStore((s) => s.clearAll);
  const labels = useOrdersFilterLabels();

  // Поле отвечает сразу, запрос к серверу — после паузы в наборе.
  const [draft, setDraft] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, setQuery]);
  useEffect(() => {
    if (query === "") setDraft("");
  }, [query]);

  const term = searchTerm(query);
  const browsing = browseAll || labels.categoryActive || labels.locationActive || !!term;

  const markSeen = useMarkFeedSeen(userId).mutate;
  useEffect(() => {
    if (userId) markSeen();
  }, [userId, markSeen]);

  const feed = useAllOpenOrders({
    userId,
    l2Ids: l2Ids.length > 0 ? l2Ids : null,
    cityId,
    district,
    query,
  });
  const rows = (feed.data?.pages ?? []).flatMap((p) => p.rows);
  const responded = useMyRespondedOrderIds(userId).data ?? EMPTY_IDS;

  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  const sections = useMemo(
    () =>
      (l1.data ?? [])
        .map((s) => ({
          section: s,
          ids: (categories.data ?? []).filter((c) => c.l1_id === s.id).map((c) => c.id),
        }))
        .filter((s) => s.ids.length > 0),
    [l1.data, categories.data],
  );

  const listRef = useRef<FlashListRef<OrderWithRefs>>(null);
  const resetCounter = useTabScrollResetCounter("find");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
  }, [resetCounter]);

  const renderOrder = (o: OrderWithRefs) => (
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
      alreadyResponded={responded.has(o.id)}
      onPress={() => router.push(`/orders/${o.id}` as never)}
    />
  );

  const header = (
    <View className="gap-2.5 px-4 pb-3">
      <SearchField
        value={draft}
        onChangeText={setDraft}
        placeholder="Название задания"
        returnKeyType="search"
        onCancel={() => {
          setDraft("");
          setQuery("");
        }}
        accessibilityLabel="Поиск заданий"
      />
      <View className="flex-row flex-wrap gap-2">
        <FilterPill
          icon={SquaresFour}
          label={labels.categoryActive ? labels.category : "Категория"}
          active={labels.categoryActive}
          onPress={() => router.push("/find/category-select" as never)}
        />
        <FilterPill
          icon={MapPin}
          label={labels.locationActive ? labels.location : "Место"}
          active={labels.locationActive}
          onPress={() => router.push("/find/location-select" as never)}
        />
        {browsing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сбросить поиск и фильтры"
            hitSlop={4}
            onPress={() => {
              hapticSelection();
              setDraft("");
              clearAll();
            }}
            className="min-h-10 flex-row items-center gap-1 rounded-pill px-3 active:opacity-60"
          >
            <X size={16} weight="bold" color={tc.mute} />
            <AppText weight="semibold" className="text-body-md text-mute">
              Сбросить
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-surface-page">
      {browsing ? (
        feed.isLoading ? (
          <View className="flex-1" style={{ paddingTop: large.contentTop }}>
            <OrderRowsSkeleton count={5} />
          </View>
        ) : feed.error ? (
          <View className="flex-1 px-6" style={{ paddingTop: large.contentTop + 16 }}>
            <AppText weight="bold" className="text-title-lg text-ink">
              {describeQueryError(feed.error).title}
            </AppText>
            <AppText className="mt-1 text-body-md text-body">
              {describeQueryError(feed.error).hint}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Повторить загрузку заданий"
              disabled={feed.isRefetching}
              onPress={() => void feed.refetch()}
              className="mt-5 min-h-12 self-start items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:bg-canvas-soft"
            >
              <AppText weight="semibold" className="text-body-md text-ink">
                {feed.isRefetching ? "Загружаем…" : "Повторить"}
              </AppText>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <View className="flex-1 items-center px-8" style={{ paddingTop: large.contentTop + 40 }}>
            <MagnifyingGlass size={44} weight="regular" color={tc.mute} />
            <AppText weight="semibold" className="mt-4 text-center text-ios-title2 text-ink">
              Ничего не нашли
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сбросить поиск и фильтры"
              onPress={() => {
                setDraft("");
                clearAll();
              }}
              className="mt-5 min-h-12 items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:bg-canvas-soft"
            >
              <AppText weight="semibold" className="text-body-md text-ink">
                Сбросить
              </AppText>
            </Pressable>
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={rows}
            extraData={responded}
            keyExtractor={(o) => o.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
            onScroll={large.onScroll}
            scrollEventThrottle={16}
            renderScrollComponent={Animated.ScrollView as never}
            renderItem={({ item }) => renderOrder(item)}
            onEndReached={() => {
              if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              feed.isFetchingNextPage ? (
                <View className="h-16 items-center justify-center">
                  <ActivityIndicator size="small" />
                </View>
              ) : null
            }
          />
        )
      ) : (
        <Animated.ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
          onScroll={large.onScroll}
          scrollEventThrottle={16}
        >
          <View className="pt-2">
            <InsetGroup title="Категории">
              {sections.map(({ section, ids }, i) => {
                const Icon = getCategoryIcon(section.icon);
                return (
                  <InsetRow
                    key={section.id}
                    title={section.name_ru}
                    icon={<Icon size={18} weight="bold" color={tc["on-accent"]} />}
                    iconAccent
                    navigates
                    onPress={() => {
                      hapticSelection();
                      setL2Ids(ids);
                    }}
                    last={i === sections.length - 1}
                  />
                );
              })}
            </InsetGroup>
          </View>

          <AppText className="mb-1.5 ml-8 mt-2 text-ios-footnote uppercase text-mute">
            Свежие задания
          </AppText>
          {feed.isLoading ? (
            <OrderRowsSkeleton count={FRESH_COUNT} />
          ) : rows.length === 0 ? (
            <AppText className="mx-8 mb-4 text-body-md text-mute">
              Открытых заданий сейчас нет
            </AppText>
          ) : (
            rows.slice(0, FRESH_COUNT).map((o) => <View key={o.id}>{renderOrder(o)}</View>)
          )}
          {rows.length > FRESH_COUNT ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Все задания"
              onPress={() => {
                hapticSelection();
                setBrowseAll(true);
              }}
              className="mx-4 min-h-12 items-center justify-center rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
            >
              <AppText weight="semibold" className="text-body-lg text-ink">
                Все задания
              </AppText>
            </Pressable>
          ) : null}
        </Animated.ScrollView>
      )}

      <LargeTitleBar
        title="Найти задание"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        alwaysCompact
        below={header}
      />
    </View>
  );
}

function FilterPill({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const tc = useThemeColors(["ink", "accent"]);
  const color = active ? tc.accent : tc.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      onPress={onPress}
      className={`min-h-10 max-w-full flex-row items-center gap-1.5 rounded-pill px-3.5 ${
        active ? "bg-accent-soft" : "border border-hairline bg-canvas"
      } active:opacity-70`}
    >
      <Icon size={16} weight="bold" color={color} />
      <AppText
        weight="semibold"
        numberOfLines={1}
        className={`shrink text-body-md ${active ? "text-accent" : "text-ink"}`}
      >
        {label}
      </AppText>
      <CaretDown size={14} weight="bold" color={color} />
    </Pressable>
  );
}
