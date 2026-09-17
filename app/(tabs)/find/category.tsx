/**
 * /find/category — задания раздела, категории или все сразу (поиск как у
 * Apple, 2026-09-17). Отдельный экран с заголовком и «назад», как категория в
 * App Store: выбранное видно в заголовке, а не в пилюлях. Справа — системные
 * меню «Категория» (внутри раздела) и «Место».
 *
 * Параметры: section — раздел (l1), l2 — одна категория, all=1 — все задания.
 */

import { FlashList } from "@shopify/flash-list";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Tray } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { FindOrderRow } from "@/features/orders/find/FindOrderRow";
import { LocationMenuItems } from "@/features/orders/find/LocationMenuItems";
import { useLocationFilter } from "@/features/orders/find/use-location-filter";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useMyRespondedOrderIds } from "@/features/orders/use-my-responded-order-ids";
import { describeQueryError } from "@/lib/describe-query-error";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

const EMPTY_IDS: ReadonlySet<string> = new Set();

export default function FindCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; l2?: string; all?: string }>();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["mute"]);
  const location = useLocationFilter();
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  // Категория внутри раздела — из меню «Категория»; null — весь раздел.
  const [sub, setSub] = useState<string | null>(null);

  const sectionId = typeof params.section === "string" ? params.section : null;
  const l2Param = typeof params.l2 === "string" ? params.l2 : null;
  const inSection = useMemo(
    () => (sectionId ? (categories.data ?? []).filter((c) => c.l1_id === sectionId) : []),
    [sectionId, categories.data],
  );

  const l2Ids = l2Param ? [l2Param] : sectionId ? (sub ? [sub] : inSection.map((c) => c.id)) : null;
  const title = l2Param
    ? (categories.data?.find((c) => c.id === l2Param)?.name_ru ?? "Категория")
    : sectionId
      ? ((sub ? inSection.find((c) => c.id === sub)?.name_ru : null) ??
        l1.data?.find((s) => s.id === sectionId)?.name_ru ??
        "Раздел")
      : "Все задания";

  const feed = useAllOpenOrders({
    userId,
    l2Ids: l2Ids && l2Ids.length > 0 ? l2Ids : null,
    cityId: location.cityId,
    district: location.district,
  });
  const rows = (feed.data?.pages ?? []).flatMap((p) => p.rows);
  const responded = useMyRespondedOrderIds(userId).data ?? EMPTY_IDS;
  const waitingForSection = !!sectionId && inSection.length === 0 && categories.isLoading;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="right">
        {sectionId && inSection.length > 1 ? (
          <Stack.Toolbar.Menu
            icon={
              sub ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle"
            }
            title="Категория"
            accessibilityLabel="Категория"
          >
            <Stack.Toolbar.MenuAction
              isOn={sub === null}
              onPress={() => {
                hapticSelection();
                setSub(null);
              }}
            >
              Весь раздел
            </Stack.Toolbar.MenuAction>
            {inSection.map((c) => (
              <Stack.Toolbar.MenuAction
                key={c.id}
                isOn={sub === c.id}
                onPress={() => {
                  hapticSelection();
                  setSub(c.id);
                }}
              >
                {c.name_ru}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        ) : null}
        {LocationMenuItems(location)}
      </Stack.Toolbar>

      {feed.isLoading || waitingForSection ? (
        <FlashList
          data={[]}
          renderItem={() => null}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={<OrderRowsSkeleton count={5} />}
        />
      ) : feed.error ? (
        <View className="flex-1 px-6 pt-32">
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
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(o) => o.id}
          extraData={responded}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingTop: 12 }}
          renderItem={({ item }) => (
            <FindOrderRow
              order={item}
              responded={responded.has(item.id)}
              onOpen={(id) => router.push(`/orders/${id}` as never)}
            />
          )}
          ListEmptyComponent={
            <View className="items-center px-8 pt-16">
              <Tray size={44} weight="regular" color={tc.mute} />
              <AppText weight="semibold" className="mt-4 text-center text-ios-title2 text-ink">
                Заданий пока нет
              </AppText>
              {location.active ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Показать по всей Ингушетии"
                  onPress={location.selectAll}
                  className="mt-5 min-h-12 items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:bg-canvas-soft"
                >
                  <AppText weight="semibold" className="text-body-md text-ink">
                    Вся Ингушетия
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          }
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
      )}
    </>
  );
}
