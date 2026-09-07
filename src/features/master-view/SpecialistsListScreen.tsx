// /(tabs)/specialists — «Специалисты»: единственное место, где ищут людей.
//
// DECISION владельца 2026-09-03: вкладка «Специалисты» с поиском по имени и
// категории — «просто и быстро».
// DECISION владельца 2026-09-06: «нажал на категорию на главной — сразу сюда
// с заданным фильтром; на самом экране — поиск, фильтр, выбор категории, как у
// референсов». Отдельный экран категории убран: он был медленнее и дублировал
// этот. Заголовок и шапка — в стиле системных приложений iOS (LargeTitle).
//
// Как устроено:
//   - параметры маршрута `l1` (раздел) / `l2` (категория) задают фильтр при
//     входе с главной; тогда название категории стоит в строке навигации;
//   - кнопка «Фильтры» в строке навигации открывает шторку
//     /specialists/filters (категория, город, сортировка) — тот же паттерн,
//     что у ленты заданий; значения в общем сторе;
//   - один RPC search_masters считает всё на сервере (миграция 0158).

import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SlidersHorizontal, Star, UsersThree } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import {
  Avatar,
  LargeTitleBar,
  LargeTitleBlock,
  SearchField,
  useLargeTitle,
} from "@/components/ui";
import { useCategoryFilterPickerStore } from "@/features/categories/category-filter-picker-store";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  countSpecialistsFilters,
  useSpecialistsFiltersStore,
} from "@/features/master-view/specialists-filters-store";
import {
  type MasterSearchResult,
  useSearchMasters,
} from "@/features/master-view/use-search-masters";
import { specialistsLabel } from "@/features/orders/plural-ru";
import { describeQueryError } from "@/lib/describe-query-error";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useThemeColors } from "@/lib/use-theme-color";

/** Та же тень, что у карточки задания: край читается без опоры на линию. */
const CARD_SHADOW = {
  shadowColor: "#000000",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

function fullName(first: string | null, last: string | null): string {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : "Специалист";
}

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : null;
}

/** Карточка специалиста — общий язык карточек: жирное имя 18, факты 16. */
function MasterCard({ master, onPress }: { master: MasterSearchResult; onPress: () => void }) {
  const tc = useThemeColors(["warning"]);
  const name = fullName(master.first_name, master.last_name);
  const place = [master.city_name, master.district].filter(Boolean).join(" · ");
  const hasRating = master.rating_avg !== null && (master.rating_count ?? 0) > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${master.categories.join(", ")}`}
      onPress={onPress}
      className="mx-4 mb-3 rounded-2xl border border-hairline bg-surface-card p-4 active:opacity-90"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-3">
        <Avatar url={master.avatar_url} name={name} seed={name} size="md" />
        <View className="min-w-0 flex-1">
          <AppText weight="bold" className="text-title-lg text-ink" numberOfLines={1}>
            {name}
          </AppText>
          {place ? (
            <AppText className="mt-0.5 text-body-sm text-mute" numberOfLines={1}>
              {place}
            </AppText>
          ) : null}
        </View>
        {hasRating ? (
          <View className="flex-row items-center gap-1">
            <Star size={16} weight="fill" color={tc.warning} />
            <AppText weight="mono" className="text-mono-md text-ink">
              {master.rating_avg?.toFixed(1)}
            </AppText>
          </View>
        ) : null}
      </View>

      {master.categories.length > 0 ? (
        <AppText weight="medium" className="mt-3 text-body-md text-ink" numberOfLines={2}>
          {master.categories.join(" · ")}
        </AppText>
      ) : null}

      {master.bio?.trim() ? (
        <AppText className="mt-1 text-body-md text-body" numberOfLines={2}>
          {master.bio.trim()}
        </AppText>
      ) : null}

      {master.experience_years ? (
        <AppText className="mt-2 text-body-sm text-mute">
          Опыт {master.experience_years} лет
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function SpecialistsListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ l1?: string | string[]; l2?: string | string[] }>();
  const tc = useThemeColors(["accent"]);
  const insets = useSafeAreaInsets();
  const tabBarSpace = insets.bottom + 24;
  const large = useLargeTitle();

  // Фильтры — общий стор со шторкой /specialists/filters. Стартовые значения
  // и повторный вход с главной с другой категорией — из параметров маршрута.
  const l1Id = useSpecialistsFiltersStore((s) => s.l1Id);
  const l2Id = useSpecialistsFiltersStore((s) => s.l2Id);
  const cityId = useSpecialistsFiltersStore((s) => s.cityId);
  const sort = useSpecialistsFiltersStore((s) => s.sort);
  const setCategory = useSpecialistsFiltersStore((s) => s.setCategory);
  const setCity = useSpecialistsFiltersStore((s) => s.setCity);
  const setSort = useSpecialistsFiltersStore((s) => s.setSort);
  const clearFilters = useSpecialistsFiltersStore((s) => s.clearAll);
  const activeFilters = useSpecialistsFiltersStore(countSpecialistsFilters);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const nextL1 = first(params.l1);
    const nextL2 = first(params.l2);
    if (nextL1 || nextL2) setCategory(nextL1, nextL2);
  }, [params.l1, params.l2, setCategory]);

  // Результаты шторок выбора.
  const categoryResult = useCategoryFilterPickerStore((s) => s.categoryResult);
  const setCategoryResult = useCategoryFilterPickerStore((s) => s.setCategoryResult);
  useEffect(() => {
    if (!categoryResult) return;
    setCategory(categoryResult.value.l1Id, categoryResult.value.l2Id);
    setCategoryResult(null);
  }, [categoryResult, setCategoryResult, setCategory]);
  const cityResult = useCategoryFilterPickerStore((s) => s.cityResult);
  const setCityResult = useCategoryFilterPickerStore((s) => s.setCityResult);
  useEffect(() => {
    if (!cityResult) return;
    setCity(cityResult.value);
    setCityResult(null);
  }, [cityResult, setCityResult, setCity]);
  const sortResult = useCategoryFilterPickerStore((s) => s.sortResult);
  const setSortResult = useCategoryFilterPickerStore((s) => s.setSortResult);
  useEffect(() => {
    if (!sortResult) return;
    setSort(sortResult.value);
    setSortResult(null);
  }, [sortResult, setSortResult, setSort]);

  // Названия для чипов и заголовка — из каталога (без сети берётся бандл).
  const sections = useCategoriesL1();
  const categories = useVisibleCategories();
  const categoryLabel = useMemo(() => {
    if (l2Id) return categories.data?.find((c) => c.id === l2Id)?.name_ru ?? "Категория";
    if (l1Id) return sections.data?.find((s) => s.id === l1Id)?.name_ru ?? "Раздел";
    return "Категория";
  }, [l1Id, l2Id, categories.data, sections.data]);
  const hasCategoryFilter = !!(l1Id || l2Id);

  // Поиск не дёргает сервер на каждую букву: 250 мс.
  const debounced = useDebouncedValue(query.trim(), 250);
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSearchMasters({
    query: debounced,
    l1Id,
    l2Id,
    cityId: cityId === "all" ? null : cityId,
    sort,
  });
  const list = useMemo(() => (data?.pages ?? []).flat(), [data]);
  const title = hasCategoryFilter ? categoryLabel : "Специалисты";

  return (
    <View className="flex-1 bg-surface-page">
      <FlashList
        data={list}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={large.onScroll}
        scrollEventThrottle={16}
        renderScrollComponent={Animated.ScrollView as never}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          // Крупный заголовок первым, под ним поиск и чипы — как у Apple под
          // large title (Настройки, Почта). DECISION владельца 2026-09-06,
          // вечер: «заголовок — в самом верху, где пустое место».
          <>
            <LargeTitleBlock
              title={title}
              subtitle={
                // Пока идёт запрос, счётчика нет — «0 специалистов» над
                // скелетоном было ложью (владелец, 2026-09-07).
                isLoading || (isFetching && !isFetchingNextPage)
                  ? null
                  : `${specialistsLabel(list.length)}${hasNextPage ? " и ещё" : ""}`
              }
            />
            <View className="px-4 pt-1 pb-3">
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Имя или услуга — например, электрик"
                accessibilityLabel="Поиск специалистов"
              />
            </View>
          </>
        }
        renderItem={({ item }) => (
          <MasterCard
            master={item}
            onPress={() => router.push(`/master/${item.user_id}` as never)}
          />
        )}
        ListEmptyComponent={
          isLoading || (isFetching && !isFetchingNextPage) ? (
            <SpecialistsSkeleton />
          ) : error ? (
            <ErrorBlock
              title={describeQueryError(error).title}
              hint={describeQueryError(error).hint}
              onRetry={() => void refetch()}
            />
          ) : (
            <EmptyBlock
              hasQuery={debounced.length > 0 || hasCategoryFilter || cityId !== "all"}
              accent={tc.accent}
              onReset={() => {
                setQuery("");
                clearFilters();
              }}
              onCreateTask={() => router.push("/orders/new" as never)}
            />
          )
        }
      />

      <LargeTitleBar
        title={title}
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        onBack={() => router.back()}
        // Одна кнопка «Фильтры» в строке навигации — как на «Заданиях»
        // (владелец, 2026-09-07: «на специалистах фильтры того же типа»).
        actions={[
          {
            label: activeFilters > 0 ? `Фильтры, выбрано ${activeFilters}` : "Фильтры",
            sf: "line.3.horizontal.decrease",
            Icon: SlidersHorizontal,
            iconOnly: true,
            active: activeFilters > 0,
            onPress: () => router.push("/specialists/filters" as never),
          },
        ]}
      />
    </View>
  );
}

function SpecialistsSkeleton() {
  return (
    <View className="pt-1">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="mx-4 mb-3 rounded-2xl border border-hairline bg-surface-card p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 rounded-full bg-canvas-soft-2" />
            <View className="flex-1 gap-2">
              <View className="h-4 w-1/2 rounded bg-canvas-soft-2" />
              <View className="h-3 w-1/3 rounded bg-canvas-soft-2" />
            </View>
          </View>
          <View className="mt-4 h-4 w-3/4 rounded bg-canvas-soft-2" />
        </View>
      ))}
    </View>
  );
}

function EmptyBlock({
  hasQuery,
  accent,
  onReset,
  onCreateTask,
}: {
  hasQuery: boolean;
  accent: string;
  onReset: () => void;
  onCreateTask: () => void;
}) {
  return (
    <View className="mt-10 items-center px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
        <UsersThree size={36} weight="bold" color={accent} />
      </View>
      <AppText weight="bold" className="mt-6 text-center text-display-sm text-ink">
        {hasQuery ? "Никого не нашли" : "Специалистов пока нет"}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">
        {hasQuery
          ? "Попробуйте другое слово или снимите фильтры. Или опишите задачу — она попадёт в общую ленту, и вам ответят."
          : "Здесь появятся исполнители, когда заполнят профиль."}
      </AppText>
      {hasQuery ? (
        <View className="mt-6 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={onReset}
            className="min-h-12 items-center justify-center rounded-pill border border-hairline-strong px-5 active:opacity-60"
          >
            <AppText weight="semibold" className="text-body-md text-ink">
              Сбросить
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCreateTask}
            className="min-h-12 items-center justify-center rounded-pill bg-accent px-5 active:opacity-85"
          >
            <AppText weight="semibold" className="text-body-md text-on-accent">
              Описать задачу
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ErrorBlock({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint: string;
  onRetry: () => void;
}) {
  return (
    <View className="mt-10 items-center px-8">
      <AppText weight="bold" className="text-center text-display-sm text-ink">
        {title}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">{hint}</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-6 min-h-12 items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:bg-canvas-soft"
      >
        <AppText weight="semibold" className="text-body-md text-ink">
          Повторить
        </AppText>
      </Pressable>
    </View>
  );
}
