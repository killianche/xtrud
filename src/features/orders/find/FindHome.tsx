/**
 * «Найти задание» — первый уровень каталога: поиск и разделы карточками
 * (владелец, 2026-10-03, очередь №158: «как в больших компаниях — карточки,
 * тап открывает следующую страницу»). Дальше: /find/section (подразделы) →
 * /find/results (задания; место — капсулой там). Разбор —
 * docs/CATALOG_NAVIGATION_2026-10.md.
 *
 * Под названием раздела — сколько в нём открытых заданий (число из данных,
 * open-order-facets.ts); порядок — как в каталоге.
 */

import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Animated, View } from "react-native";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { LargeTitleBlock, type useLargeTitle } from "@/components/ui/LargeTitle";
import { SearchField } from "@/components/ui/SearchField";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { CategoryMatches } from "@/features/categories/CategoryMatches";
import { SectionGrid, SectionGridSkeleton } from "@/features/categories/SectionGrid";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { tasksLabel } from "@/features/orders/plural-ru";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { countByCategory, countInCategories } from "./open-order-facets";
import { useOpenOrderFacets } from "./use-open-order-facets";

export function FindHome({
  contentTop,
  onScroll,
}: {
  contentTop: number;
  onScroll: ReturnType<typeof useLargeTitle>["onScroll"];
}) {
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const setL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  // Числа — в том месте, что выбрано на экране заданий, иначе карточка
  // обещала «3», а список показывал «1» (аудит 2026-10-03).
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const place = useMemo(() => ({ cityId, district }), [cityId, district]);
  const [query, setQuery] = useState("");

  // Вход на вкладку снимает бейдж новых заданий.
  const markSeen = useMarkFeedSeen(userId).mutate;
  useEffect(() => {
    if (userId) markSeen();
  }, [userId, markSeen]);

  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  const facets = useOpenOrderFacets(userId);
  const counts = useMemo(() => countByCategory(facets.data ?? [], place), [facets.data, place]);

  const tiles = useMemo(() => {
    const all = categories.data ?? [];
    return (
      (l1.data ?? [])
        .map((s) => {
          const ids = new Set(all.filter((c) => c.l1_id === s.id).map((c) => c.id));
          const n = facets.data ? countInCategories(facets.data, ids, place) : null;
          return { s, ids, n };
        })
        .filter(({ ids }) => ids.size > 0)
        // Порядок каталога, без пересортировки по числу заданий: число
        // приходит отдельным запросом, и карточки менялись бы местами под
        // пальцем (QA 2026-10-03).
        .map(({ s, n }) => ({
          id: s.id,
          name: s.name_ru,
          icon: s.icon,
          meta: n === null ? null : n > 0 ? tasksLabel(n) : "Пока нет заданий",
        }))
    );
  }, [l1.data, categories.data, facets.data, place]);

  const openResults = (l2Id: string) => {
    setL2Ids([l2Id]);
    router.push("/find/results" as never);
  };

  const searching = query.trim().length > 0;
  const loading = l1.isLoading || categories.isLoading;
  const failed = !loading && (l1.error || categories.error);

  return (
    <Animated.ScrollView
      contentContainerStyle={{ paddingTop: contentTop, paddingBottom: tabBarSpace + 16 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <LargeTitleBlock title="Найти задание" />
      <View className="mb-5 px-4">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Например, электрик или уборка"
        />
      </View>

      {searching ? (
        <CategoryMatches
          query={query}
          valueFor={(id) => (facets.data && counts.get(id) ? String(counts.get(id)) : undefined)}
          labelFor={(id, name) =>
            facets.data ? `${name}, ${tasksLabel(counts.get(id) ?? 0)}` : undefined
          }
          onPick={openResults}
        />
      ) : loading ? (
        <SectionGridSkeleton />
      ) : failed ? (
        <InsetGroup footer="Не удалось загрузить разделы. Проверьте связь.">
          <InsetRow
            title="Повторить"
            onPress={() => {
              void l1.refetch();
              void categories.refetch();
            }}
            last
          />
        </InsetGroup>
      ) : (
        <SectionGrid
          tiles={tiles}
          onPress={(l1Id) =>
            router.push({ pathname: "/find/section", params: { l1: l1Id } } as never)
          }
        />
      )}
    </Animated.ScrollView>
  );
}
