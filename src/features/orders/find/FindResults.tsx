/**
 * /find/results — задания выбранного подраздела (третий уровень каталога:
 * /find → /find/section → сюда). Шапка хранит выбор, как у Airbnb после поиска
 * («Дома в Сан-Франциско · 2–4 окт · 2 гостя»): крупный заголовок —
 * категория, место — капсулой, она же его меняет;
 * категория — «назад» к выбору.
 */

import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { MapPin, Tray } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { FilterChip } from "@/components/ui/FilterChip";
import { LargeTitleBar, LargeTitleBlock, useLargeTitle } from "@/components/ui/LargeTitle";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useMyRespondedOrderIds } from "@/features/orders/use-my-responded-order-ids";
import { describeQueryError } from "@/lib/describe-query-error";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";
import { FindOrderRow } from "./FindOrderRow";

const EMPTY_IDS: ReadonlySet<string> = new Set();

export function FindResults() {
  const router = useRouter();
  const large = useLargeTitle();
  const tabBarSpace = useTabBarSpace();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["mute"]);

  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);

  const categories = useVisibleCategories();
  const cities = useCities();
  const feed = useAllOpenOrders({
    userId,
    l2Ids: l2Ids.length > 0 ? l2Ids : null,
    cityId,
    district,
  });
  const rows = (feed.data?.pages ?? []).flatMap((p) => p.rows);
  const responded = useMyRespondedOrderIds(userId).data ?? EMPTY_IDS;

  const l2Id = l2Ids[0] ?? null;
  const title = categories.data?.find((c) => c.id === l2Id)?.name_ru ?? "Задания";
  const placeLabel = cityId
    ? (cities.data?.find((c) => c.id === cityId)?.name ?? "Город")
    : district || "Вся Ингушетия";

  const header = (
    <View className="pb-4">
      {/* Без счётчика «N заданий» (владелец, 2026-10-03); место — на капсуле. */}
      <LargeTitleBlock title={title} />
      <View className="flex-row px-4">
        <FilterChip
          label={placeLabel}
          Icon={MapPin}
          active={!!(cityId || district)}
          accessibilityLabel={`Место: ${placeLabel}. Изменить`}
          onPress={() => router.push("/find/location-select" as never)}
        />
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-surface-page">
      <FlashList
        data={feed.error ? [] : rows}
        keyExtractor={(o) => o.id}
        extraData={responded}
        contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
        onScroll={large.onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={header}
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
          ) : feed.isLoading ? (
            <OrderRowsSkeleton count={5} />
          ) : (
            <View className="items-center px-8 pt-12">
              <Tray size={44} weight="regular" color={tc.mute} />
              <AppText weight="semibold" className="mt-4 text-center text-ios-title2 text-ink">
                Здесь пока нет заданий
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Выбрать другую категорию"
                onPress={() => router.back()}
                className="mt-4 min-h-11 items-center justify-center px-4 active:opacity-60"
              >
                <AppText weight="semibold" className="text-body-md text-accent">
                  Выбрать другую категорию
                </AppText>
              </Pressable>
            </View>
          )
        }
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
      />
      <LargeTitleBar
        title={title}
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)/find" as never)
        }
      />
    </View>
  );
}
