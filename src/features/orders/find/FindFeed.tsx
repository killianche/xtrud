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
import { CaretDown, MapPin, SlidersHorizontal, SquaresFour, Tray, X } from "phosphor-react-native";
import { useMemo } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { Button, FLOATING_PILL_SPACE, FloatingPillButton } from "@/components/ui";
import type { useLargeTitle } from "@/components/ui/LargeTitle";
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
import { CARD_SHADOW } from "@/lib/shadows";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";
import { FeaturedSections } from "./FeaturedSections";
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

  // №313 (владелец, 2026-10-08, референс — логика Авито): заголовок, под ним
  // строка «место» и выбранная категория капсулой с крестиком (сброс одним
  // касанием); плитки основных разделов — только пока категория не выбрана.
  const catLabel = categoryLabel(summaryInput);
  const where = placeLabel(summaryInput);
  const clearCategory = () => filters.setCategory("", []);

  // «Уточнить» всегда открывает список разделов: выбранный раздел там обведён
  // и подписан подкатегорией, человек видит выбор целиком (владелец,
  // 2026-10-08, №317 — раньше открывались сразу подкатегории).
  const refine = () => router.push("/find-category" as never);

  const header = (
    <View className="pb-4">
      <AppText
        accessibilityRole="header"
        weight="bold"
        className="px-4 pt-3 pb-3 text-ios-large-title text-ink"
      >
        Найти задание
      </AppText>
      <View className="flex-row flex-wrap items-center gap-2 px-4 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Место: ${where ?? "вся Ингушетия"}. Изменить`}
          onPress={() => router.push("/find-place" as never)}
          hitSlop={4}
          className={`min-h-10 max-w-full flex-row items-center gap-1.5 rounded-pill px-3.5 active:opacity-70 ${
            where ? "bg-accent-soft" : "bg-surface-card"
          }`}
          style={CARD_SHADOW}
        >
          <MapPin size={16} weight="bold" color={where ? tc.accent : tc.ink} />
          <AppText
            weight="semibold"
            className={`shrink text-ios-subheadline ${where ? "text-accent" : "text-ink"}`}
            numberOfLines={1}
          >
            {where ?? "Вся Ингушетия"}
          </AppText>
          <CaretDown size={14} weight="bold" color={where ? tc.accent : tc.mute} />
        </Pressable>
        {catLabel ? (
          <View
            className="min-h-10 max-w-full flex-row items-center rounded-pill bg-accent-soft"
            style={CARD_SHADOW}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Категория: ${catLabel}. Уточнить`}
              onPress={refine}
              hitSlop={4}
              className="min-h-10 shrink flex-row items-center gap-1.5 pl-3.5 pr-1 active:opacity-70"
            >
              <SquaresFour size={16} weight="bold" color={tc.accent} />
              <AppText
                weight="semibold"
                className="shrink text-ios-subheadline text-accent"
                numberOfLines={1}
              >
                {catLabel}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сбросить категорию"
              onPress={clearCategory}
              hitSlop={6}
              className="h-10 w-10 items-center justify-center active:opacity-60"
            >
              <X size={16} weight="bold" color={tc.accent} />
            </Pressable>
          </View>
        ) : null}
      </View>
      {catLabel ? null : <FeaturedSections onAll={() => router.push("/find-category" as never)} />}
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
    <View className="flex-1">
      <FlashList
        data={feed.error ? [] : rows}
        keyExtractor={(o) => o.id}
        extraData={responded}
        contentContainerStyle={{
          paddingTop: contentTop,
          paddingBottom: tabBarSpace + FLOATING_PILL_SPACE,
        }}
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
      <RefineButton onPress={refine} />
    </View>
  );
}

/**
 * «Уточнить» — плавающая капсула по центру над нижним меню (№294), тот же
 * отступ, что у кнопки «+» на главной (FloatingActionButton): меню
 * системное, iOS уже включает его в безопасную область.
 */
function RefineButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["on-accent"]);
  // Яркая розовая (владелец, 2026-10-08, №316): главное действие ленты.
  return (
    <FloatingPillButton
      label="Уточнить"
      accessibilityLabel="Уточнить категорию"
      icon={<SlidersHorizontal size={20} weight="bold" color={tc["on-accent"]} />}
      onPress={onPress}
      bottom={insets.bottom + 10}
    />
  );
}
