/**
 * «Найти задание» — лента открытых заданий (владелец, 2026-09-21: «сверху нет
 * заголовка, фильтры, геолокация, закреплённая шапка — всё не нравится,
 * сделай редизайн с нуля»). Спецификация — docs/FIND_SCREEN_REDESIGN.md.
 *
 * Суть: управление поиском и фильтром больше не живёт в закреплённой зоне.
 * Поле поиска и строка «Фильтры» — первые строки самого списка: уезжают вверх
 * вместе с лентой и возвращаются, когда человек прокручивает назад. Сверху —
 * обычный крупный заголовок вкладки, он схлопывается сам.
 *
 * Категория и место выбираются на отдельном экране «Фильтры» (/find/filters)
 * прежними шторками; выбранное видно в самой строке, «×» сбрасывает всё.
 */

import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { CaretRight, MagnifyingGlass, SlidersHorizontal, Tray, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { searchTerm } from "@/features/orders/search-term";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useMyRespondedOrderIds } from "@/features/orders/use-my-responded-order-ids";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { describeQueryError } from "@/lib/describe-query-error";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";
import { FindOrderRow } from "./FindOrderRow";
import { filtersSummary } from "./filters-summary";

const EMPTY_IDS: ReadonlySet<string> = new Set();

export function FindFeed() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["ink", "mute", "accent", "muted-soft"]);

  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const clearAll = useOrdersSearchFiltersStore((s) => s.clearAll);

  // Текст в поле меняется сразу, запрос к серверу — после паузы в наборе.
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const term = searchTerm(query);

  const markSeen = useMarkFeedSeen(userId).mutate;
  useEffect(() => {
    if (userId) markSeen();
  }, [userId, markSeen]);

  const feed = useAllOpenOrders({
    userId,
    l2Ids: l2Ids.length > 0 ? l2Ids : null,
    cityId,
    district,
    query: term,
  });
  const rows = (feed.data?.pages ?? []).flatMap((p) => p.rows);
  const responded = useMyRespondedOrderIds(userId).data ?? EMPTY_IDS;

  const categories = useVisibleCategories();
  const l1 = useCategoriesL1();
  const cities = useCities();
  const summary = useMemo(
    () =>
      filtersSummary({
        l2Ids,
        cityId,
        district,
        categories: categories.data ?? [],
        sections: l1.data ?? [],
        cityName: cities.data?.find((c) => c.id === cityId)?.name,
      }),
    [l2Ids, cityId, district, categories.data, l1.data, cities.data],
  );
  const filtersActive = summary !== null;
  const canReset = filtersActive || text.length > 0;

  const resetAll = () => {
    hapticSelection();
    setText("");
    setQuery("");
    clearAll();
  };

  const header = (
    <View className="gap-3 px-4 pb-3 pt-2">
      <View className="min-h-11 flex-row items-center gap-2 rounded-pill bg-surface-2 px-4 py-2">
        <MagnifyingGlass size={18} weight="bold" color={tc.mute} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Название задания"
          placeholderTextColor={tc["muted-soft"]}
          selectionColor={tc.accent}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Поиск заданий"
          className="flex-1 text-ios-body text-ink"
          style={{ paddingVertical: 0, ...({ outlineStyle: "none" } as object) }}
        />
      </View>

      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filtersActive ? `Фильтры: ${summary}` : "Фильтры"}
          onPress={() => router.push("/find/filters" as never)}
          className={`min-h-12 flex-1 flex-row items-center gap-2.5 rounded-xl border px-4 py-2 ${
            filtersActive ? "border-accent bg-accent-soft" : "border-hairline bg-canvas"
          } active:opacity-70`}
        >
          <SlidersHorizontal size={18} weight="bold" color={filtersActive ? tc.accent : tc.mute} />
          <View className="min-w-0 flex-1">
            {filtersActive ? (
              <>
                <AppText className="text-caption text-mute">Фильтры</AppText>
                <AppText weight="medium" numberOfLines={1} className="text-body-md text-ink">
                  {summary}
                </AppText>
              </>
            ) : (
              <AppText className="text-body-md text-mute">Фильтры</AppText>
            )}
          </View>
          <CaretRight
            size={16}
            weight="bold"
            color={filtersActive ? tc.accent : tc["muted-soft"]}
          />
        </Pressable>
        {filtersActive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сбросить фильтры"
            onPress={resetAll}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface-2 active:opacity-70"
          >
            <X size={18} weight="bold" color={tc.mute} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (feed.error) {
    return (
      <FlashList
        data={[]}
        renderItem={() => null}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {header}
            <View className="px-5 pt-6">
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
          </>
        }
      />
    );
  }

  return (
    <FlashList
      data={rows}
      keyExtractor={(o) => o.id}
      extraData={responded}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <FindOrderRow
          order={item}
          responded={responded.has(item.id)}
          onOpen={(id) => router.push(`/orders/${id}` as never)}
        />
      )}
      ListEmptyComponent={
        feed.isLoading ? (
          <OrderRowsSkeleton count={5} />
        ) : (
          <View className="items-center px-8 pt-12">
            {canReset ? (
              <MagnifyingGlass size={44} weight="regular" color={tc.mute} />
            ) : (
              <Tray size={44} weight="regular" color={tc.mute} />
            )}
            <AppText weight="semibold" className="mt-4 text-center text-ios-title2 text-ink">
              {canReset ? "Ничего не нашли" : "Открытых заданий пока нет"}
            </AppText>
            {canReset ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Сбросить фильтры"
                onPress={resetAll}
                className="mt-4 min-h-11 items-center justify-center px-4 active:opacity-60"
              >
                <AppText weight="semibold" className="text-body-md text-accent">
                  Сбросить фильтры
                </AppText>
              </Pressable>
            ) : null}
          </View>
        )
      }
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
    />
  );
}
