/**
 * «Найти задание» — поиск как у Apple в iOS 26 (владелец, 2026-09-17: «поиск и
 * пилюли сверху занимают много места; сделай в точности, как делает Apple»).
 *
 * Образец — вкладка «Поиск» в App Store и Музыке:
 *   - вкладка — отдельная круглая кнопка справа в панели (role="search");
 *   - поле поиска системное (Stack.SearchBar): в iOS 26 оно внизу, над
 *     панелью, и ничего не занимает сверху;
 *   - сверху — крупный заголовок, сворачивается при прокрутке; справа —
 *     системное меню «Место» с галочкой у выбранного;
 *   - до ввода — разделы каталога и новые задания; раздел открывается
 *     отдельным экраном с заголовком и «назад» (/find/category);
 *   - при вводе — подходящие категории и задания.
 */

import { FlashList } from "@shopify/flash-list";
import { Stack, useRouter } from "expo-router";
import { MagnifyingGlass } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { InsetGroup, InsetRow } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { searchTerm } from "@/features/orders/search-term";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useMyRespondedOrderIds } from "@/features/orders/use-my-responded-order-ids";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";
import { FindOrderRow } from "./FindOrderRow";
import { LocationMenuItems } from "./LocationMenuItems";
import { useLocationFilter } from "./use-location-filter";

const EMPTY_IDS: ReadonlySet<string> = new Set();
const RECENT_COUNT = 3;

export function FindSearchHome() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["on-accent", "mute"]);
  const location = useLocationFilter();

  // Поле отвечает сразу, запрос к серверу — после паузы в наборе.
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

  const recent = useAllOpenOrders({
    userId,
    cityId: location.cityId,
    district: location.district,
  });
  const results = useAllOpenOrders({
    userId,
    cityId: location.cityId,
    district: location.district,
    query: term,
  });
  const responded = useMyRespondedOrderIds(userId).data ?? EMPTY_IDS;

  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  const sections = useMemo(
    () => (l1.data ?? []).filter((s) => (categories.data ?? []).some((c) => c.l1_id === s.id)),
    [l1.data, categories.data],
  );
  const matchedCategories = useMemo(() => {
    if (!term) return [];
    const needle = term.toLocaleLowerCase("ru-RU");
    return (categories.data ?? [])
      .filter((c) => c.name_ru.toLocaleLowerCase("ru-RU").includes(needle))
      .slice(0, 5);
  }, [term, categories.data]);

  const openOrder = (id: string) => router.push(`/orders/${id}` as never);
  const recentRows = (recent.data?.pages ?? []).flatMap((p) => p.rows);
  const resultRows = (results.data?.pages ?? []).flatMap((p) => p.rows);

  return (
    <>
      <Stack.SearchBar
        placeholder="Название задания"
        onChangeText={(e) => setText(e.nativeEvent.text)}
        onCancelButtonPress={() => setText("")}
        autoCapitalize="none"
      />
      <Stack.Toolbar placement="right">{LocationMenuItems(location)}</Stack.Toolbar>

      {term ? (
        <FlashList
          data={resultRows}
          keyExtractor={(o) => o.id}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          extraData={responded}
          ListHeaderComponent={
            <View className="pt-3">
              {matchedCategories.length > 0 ? (
                <InsetGroup title="Категории">
                  {matchedCategories.map((c, i) => {
                    const Icon = getCategoryIcon(c.icon);
                    return (
                      <InsetRow
                        key={c.id}
                        title={c.name_ru}
                        icon={<Icon size={18} weight="bold" color={tc["on-accent"]} />}
                        iconAccent
                        navigates
                        onPress={() =>
                          router.push({ pathname: "/find/category", params: { l2: c.id } } as never)
                        }
                        last={i === matchedCategories.length - 1}
                      />
                    );
                  })}
                </InsetGroup>
              ) : null}
              {resultRows.length > 0 ? (
                <AppText className="mb-1.5 ml-8 text-ios-footnote uppercase text-mute">
                  Задания
                </AppText>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <FindOrderRow order={item} responded={responded.has(item.id)} onOpen={openOrder} />
          )}
          ListEmptyComponent={
            results.isLoading ? (
              <OrderRowsSkeleton count={3} />
            ) : matchedCategories.length === 0 ? (
              <View className="items-center px-8 pt-12">
                <MagnifyingGlass size={44} weight="regular" color={tc.mute} />
                <AppText weight="semibold" className="mt-4 text-center text-ios-title2 text-ink">
                  Ничего не нашли
                </AppText>
              </View>
            ) : null
          }
          onEndReached={() => {
            if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
        />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View className="pt-3">
            <InsetGroup title="Разделы">
              {sections.map((s, i) => {
                const Icon = getCategoryIcon(s.icon);
                return (
                  <InsetRow
                    key={s.id}
                    title={s.name_ru}
                    icon={<Icon size={18} weight="bold" color={tc["on-accent"]} />}
                    iconAccent
                    navigates
                    onPress={() =>
                      router.push({
                        pathname: "/find/category",
                        params: { section: s.id },
                      } as never)
                    }
                    last={i === sections.length - 1}
                  />
                );
              })}
            </InsetGroup>
          </View>

          <AppText className="mb-1.5 ml-8 mt-2 text-ios-footnote uppercase text-mute">
            Новые задания
          </AppText>
          {recent.isLoading ? (
            <OrderRowsSkeleton count={RECENT_COUNT} />
          ) : recentRows.length === 0 ? (
            <AppText className="mx-8 mb-4 text-body-md text-mute">
              Открытых заданий сейчас нет
            </AppText>
          ) : (
            recentRows
              .slice(0, RECENT_COUNT)
              .map((o) => (
                <FindOrderRow
                  key={o.id}
                  order={o}
                  responded={responded.has(o.id)}
                  onOpen={openOrder}
                />
              ))
          )}
          {recentRows.length > RECENT_COUNT ? (
            <InsetGroup>
              <InsetRow
                title="Все задания"
                navigates
                onPress={() =>
                  router.push({ pathname: "/find/category", params: { all: "1" } } as never)
                }
                last
              />
            </InsetGroup>
          ) : null}
        </ScrollView>
      )}
    </>
  );
}
