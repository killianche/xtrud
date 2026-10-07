/**
 * Вкладка «Специалисты» — сначала категория, потом люди (DECISION владельца
 * 2026-09-07: «когда кликаем на специалисты, пусть открывается список
 * категорий; выбрал — открываются сами специалисты»). С 2026-10-03 (№158) —
 * три уровня, как в «Найти задание»: разделы карточками → /specialists/category
 * (подразделы, первой строкой «Все специалисты раздела») →
 * /specialists/section (люди). Каждый уровень — экран стека со свайпом назад.
 *
 * Владелец, 2026-10-04: переключатель «Найти специалиста / Я специалист»
 * убран, заголовок — как у «Найти задание» (крупный в начале списка,
 * компактный при прокрутке). Настройки специалиста — в профиле
 * («Я специалист» → /profile/specialist), туда же переехал счётчик новых
 * отзывов.
 */

import { useRouter } from "expo-router";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Animated, type FlatList, type ScrollView, View } from "react-native";
import { InsetGroup, InsetRow, SearchField } from "@/components/ui";
import { LargeTitleBar, LargeTitleBlock, useLargeTitle } from "@/components/ui/LargeTitle";
import { CategoryMatches } from "@/features/categories/CategoryMatches";
import { onlyCategoryId } from "@/features/categories/only-category";
import { SectionGrid, SectionGridSkeleton } from "@/features/categories/SectionGrid";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { FEATURED_SECTION_IDS } from "@/lib/product-scope";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";

export default function SpecialistsCategoriesScreen() {
  const router = useRouter();
  // Строки с кнопками в покое нет — стартовая высота 0, без прыжка (как в
  // «Найти задание»).
  const large = useLargeTitle(0);
  const tabBarSpace = useTabBarSpace();
  const [query, setQuery] = useState("");
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();

  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("specialists");
  useEffect(() => {
    if (resetCounter === 0) return;
    scrollViewToTop(scrollRef as unknown as RefObject<FlatList | null>);
  }, [resetCounter]);

  // Разделы карточками; тап — экран подразделов (владелец, 2026-10-03,
  // №158: раскрытие на месте «получше, но не идеально» — нужен переход).
  const tiles = useMemo(() => {
    const all = categories.data ?? [];
    return (
      (l1.data ?? [])
        // Без счётчиков (владелец, 2026-10-03: «убери эти счётчики везде»).
        .filter((s) => all.some((c) => c.l1_id === s.id))
        .map((s) => ({ id: s.id, name: s.name_ru, icon: s.icon }))
    );
  }, [l1.data, categories.data]);

  const openCategory = (l2Id: string) =>
    router.push({ pathname: "/specialists/section", params: { l2: l2Id } } as never);
  // Раздел из одной подкатегории — сразу к специалистам (№239).
  const openSection = (l1Id: string) => {
    const only = onlyCategoryId(categories.data ?? [], l1Id);
    if (only) openCategory(only);
    else router.push({ pathname: "/specialists/category", params: { l1: l1Id } } as never);
  };

  return (
    <View className="flex-1 bg-surface-page">
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace + 16 }}
        onScroll={large.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <LargeTitleBlock title="Специалисты" />
        <View className="mb-5 px-4">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Например, электрик или уборка"
          />
        </View>
        {query.trim().length > 0 ? (
          <CategoryMatches query={query} onPick={openCategory} />
        ) : l1.isLoading || categories.isLoading ? (
          <SectionGridSkeleton />
        ) : l1.error || categories.error ? (
          <InsetGroup footer="Не удалось загрузить категории. Проверьте связь.">
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
          <SectionGrid tiles={tiles} onPress={openSection} featuredIds={FEATURED_SECTION_IDS} />
        )}
      </Animated.ScrollView>
      <LargeTitleBar
        title="Специалисты"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />
    </View>
  );
}
