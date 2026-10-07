/**
 * Вкладка «Найти задание» — сразу список заданий (владелец, 2026-10-05, №235:
 * «открываешь — список заданий, 20–25, внизу "Загрузить ещё"; кнопка
 * "Фильтр" — категория и подкатегория, локация; в стиле iOS»).
 *
 * Сверху крупный заголовок и две капсулы — «Категория» и «Место» (№238):
 * выбор виден на капсуле, каждая открывает свою шторку (`/find-category`,
 * `/find-place`). Список — по 20, дальше
 * «Загрузить ещё»: человек сам решает, листать ли дальше. Жест вниз —
 * обновить. Пусто/ошибка/загрузка — свои состояния.
 */

import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { MapPin, SquaresFour, Tray } from "phosphor-react-native";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { Button } from "@/components/ui";
import { FilterChip } from "@/components/ui/FilterChip";
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
import { describeQueryError } from "@/lib/describe-query-error";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";
import { FindOrderRow } from "./FindOrderRow";
import { categoryLabel, placeLabel } from "./filter-summary";

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

  const filters = useOrdersSearchFiltersStore();
  const activeCount = countActiveFilters(filters);
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  const summaryInput = useMemo(
    () => ({
      l1Id: filters.l1Id,
      l2Ids: filters.l2Ids,
      wholeSection: filters.wholeSection,
      cityId: filters.cityId,
      district: filters.district,
      village: filters.village,
      sectionName: (id: string) => sections.data?.find((s) => s.id === id)?.name_ru,
      categoryName: (id: string) => categories.data?.find((c) => c.id === id)?.name_ru,
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

  // Две капсулы, как у Avito и Airbnb: выбор виден прямо на кнопке
  // (владелец, 2026-10-05, №238; docs/FIND_FILTERS_2026-10.md).
  const catLabel = categoryLabel(summaryInput);
  const where = placeLabel(summaryInput);
  const header = (
    <View className="pb-3">
      <LargeTitleBlock title="Найти задание" />
      {/* Одна строка с прокруткой вбок: длинный выбор («Инарки, Малгобекский
          р-н») не переносит вторую капсулу вниз. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        <FilterChip
          label={catLabel ?? "Категории"}
          Icon={SquaresFour}
          active={!!catLabel}
          accessibilityLabel={`Категория: ${catLabel ?? "все"}. Изменить`}
          onPress={() => router.push("/find-category" as never)}
        />
        <FilterChip
          label={where ?? "Вся Ингушетия"}
          Icon={MapPin}
          active={!!where}
          accessibilityLabel={`Место: ${where ?? "вся Ингушетия"}. Изменить`}
          onPress={() => router.push("/find-place" as never)}
        />
      </ScrollView>
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
          mine={!!userId && item.client_id === userId}
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
