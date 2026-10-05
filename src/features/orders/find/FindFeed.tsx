/**
 * Вкладка «Найти задание» — сразу список заданий (владелец, 2026-10-05, №235:
 * «открываешь — список заданий, 20–25, внизу "Загрузить ещё"; кнопка
 * "Фильтр" — категория и подкатегория, локация; в стиле iOS»).
 *
 * Сверху крупный заголовок и капсула «Фильтры» (со счётчиком выбранного) —
 * открывает системную шторку `/find-filters`. Под капсулой — что выбрано
 * («Обои · Экажево, Назрановский р-н») и «Сбросить». Список — по 20, дальше
 * «Загрузить ещё»: человек сам решает, листать ли дальше. Жест вниз —
 * обновить. Пусто/ошибка/загрузка — свои состояния.
 */

import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { SlidersHorizontal, Tray } from "phosphor-react-native";
import { useEffect, useMemo } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { Button } from "@/components/ui";
import { LargeTitleBlock, type useLargeTitle } from "@/components/ui/LargeTitle";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useMyRespondedOrderIds } from "@/features/orders/use-my-responded-order-ids";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { describeQueryError } from "@/lib/describe-query-error";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";
import { FindOrderRow } from "./FindOrderRow";
import { filterSummary } from "./filter-summary";

const EMPTY_IDS: ReadonlySet<string> = new Set();

export function FindFeed({
  contentTop,
  onScroll,
}: {
  contentTop: number;
  onScroll: ReturnType<typeof useLargeTitle>["onScroll"];
}) {
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();
  const tc = useThemeColors(["mute", "ink", "accent", "on-accent"]);
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  // Вход на вкладку снимает бейдж новых заданий.
  const markSeen = useMarkFeedSeen(userId).mutate;
  useEffect(() => {
    if (userId) markSeen();
  }, [userId, markSeen]);

  const filters = useOrdersSearchFiltersStore();
  const activeCount = countActiveFilters(filters);
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  const summary = useMemo(
    () =>
      filterSummary({
        l1Id: filters.l1Id,
        l2Ids: filters.l2Ids,
        wholeSection: filters.wholeSection,
        cityId: filters.cityId,
        district: filters.district,
        village: filters.village,
        sectionName: (id) => sections.data?.find((s) => s.id === id)?.name_ru,
        categoryName: (id) => categories.data?.find((c) => c.id === id)?.name_ru,
      }),
    [filters, sections.data, categories.data],
  );

  const feed = useAllOpenOrders({
    userId,
    l2Ids: filters.l2Ids.length > 0 ? filters.l2Ids : null,
    cityId: filters.cityId,
    district: filters.district,
    village: filters.village,
  });
  const rows = (feed.data?.pages ?? []).flatMap((p) => p.rows);
  const responded = useMyRespondedOrderIds(userId).data ?? EMPTY_IDS;

  const header = (
    <View className="pb-3">
      <LargeTitleBlock title="Найти задание" />
      <View className="flex-row items-center gap-3 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            activeCount > 0 ? `Фильтры, выбрано: ${activeCount}` : "Фильтры: категория и место"
          }
          onPress={() => router.push("/find-filters" as never)}
          className={`min-h-11 flex-row items-center gap-2 rounded-pill border px-4 active:opacity-70 ${
            activeCount > 0 ? "border-accent bg-accent-soft" : "border-hairline bg-canvas"
          }`}
        >
          <SlidersHorizontal size={18} weight="bold" color={activeCount > 0 ? tc.accent : tc.ink} />
          <AppText
            weight="semibold"
            className={`text-ios-callout ${activeCount > 0 ? "text-accent" : "text-ink"}`}
          >
            Фильтры
          </AppText>
          {activeCount > 0 ? (
            <View className="h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5">
              <AppText weight="semibold" className="text-ios-caption1 text-on-accent">
                {activeCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
        {activeCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сбросить фильтры"
            onPress={filters.clearAll}
            hitSlop={8}
            className="min-h-11 justify-center active:opacity-60"
          >
            <AppText weight="semibold" className="text-ios-callout text-accent">
              Сбросить
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {summary ? (
        <AppText className="mt-2 px-4 text-ios-subheadline text-mute" numberOfLines={2}>
          {summary}
        </AppText>
      ) : null}
    </View>
  );

  const footer =
    rows.length > 0 && feed.hasNextPage ? (
      <View className="px-4 pb-4 pt-2">
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          loading={feed.isFetchingNextPage}
          disabled={feed.isFetchingNextPage}
          onPress={() => void feed.fetchNextPage()}
        >
          Загрузить ещё
        </Button>
      </View>
    ) : rows.length > 0 ? (
      <AppText className="px-4 pb-4 pt-2 text-center text-ios-footnote text-mute">
        Это все задания
      </AppText>
    ) : null;

  return (
    <FlashList
      data={feed.error ? [] : rows}
      keyExtractor={(o) => o.id}
      extraData={responded}
      contentContainerStyle={{ paddingTop: contentTop, paddingBottom: tabBarSpace + 16 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={feed.isRefetching && !feed.isFetchingNextPage && !feed.isLoading}
          onRefresh={() => void feed.refetch()}
          tintColor={tc.mute}
          progressViewOffset={contentTop}
        />
      }
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      renderItem={({ item }) => (
        <FindOrderRow
          order={item}
          responded={responded.has(item.id)}
          onOpen={(id) => router.push(`/orders/${id}` as never)}
        />
      )}
      ListEmptyComponent={
        feed.error ? (
          <View className="px-5 pt-6">
            <AppText weight="bold" className="text-title-lg text-ink">
              {describeQueryError(feed.error).title}
            </AppText>
            <AppText className="mt-1 text-body-md text-body">
              {describeQueryError(feed.error).hint}
            </AppText>
            <View className="mt-5 self-start">
              <Button
                variant="secondary"
                loading={feed.isRefetching}
                onPress={() => void feed.refetch()}
              >
                Повторить
              </Button>
            </View>
          </View>
        ) : feed.isLoading ? (
          <OrderRowsSkeleton count={5} />
        ) : (
          <View className="items-center px-8 pt-12">
            <Tray size={44} weight="regular" color={tc.mute} />
            <AppText weight="semibold" className="mt-4 text-center text-ios-title2 text-ink">
              {activeCount > 0 ? "По этим фильтрам заданий нет" : "Заданий пока нет"}
            </AppText>
            {activeCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={filters.clearAll}
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
    />
  );
}
