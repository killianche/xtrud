/**
 * Вкладка «Специалисты» — сначала категория, потом люди (DECISION владельца
 * 2026-09-07: «когда кликаем на специалисты, пусть открывается список
 * категорий; выбрал — открываются сами специалисты»). Разделы каталога
 * группами, первая строка — «Весь раздел», внутри — категории. Тап ведёт на
 * /specialists/section (экран стека — свайп назад работает).
 */

import { useRouter } from "expo-router";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Animated, type FlatList, type ScrollView, View } from "react-native";
import {
  InsetGroup,
  InsetRow,
  LargeTitleBar,
  LargeTitleBlock,
  SearchField,
  useLargeTitle,
} from "@/components/ui";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColors } from "@/lib/use-theme-color";

export default function SpecialistsCategoriesScreen() {
  const router = useRouter();
  const large = useLargeTitle();
  const tabBarSpace = useTabBarSpace();
  const tc = useThemeColors(["ink", "on-accent"]);
  const [query, setQuery] = useState("");
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();

  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("specialists");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(scrollRef as unknown as RefObject<FlatList | null>);
  }, [resetCounter]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (l1.data ?? [])
      .map((s) => ({
        section: s,
        rows: (categories.data ?? []).filter(
          (c) =>
            c.l1_id === s.id &&
            (!q || c.name_ru.toLowerCase().includes(q) || s.name_ru.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [l1.data, categories.data, query]);

  const openSection = (l1Id: string) =>
    router.push({ pathname: "/specialists/section", params: { l1: l1Id } } as never);
  const openCategory = (l2Id: string) =>
    router.push({ pathname: "/specialists/section", params: { l2: l2Id } } as never);

  return (
    <View className="flex-1 bg-surface-page">
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
        onScroll={large.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <LargeTitleBlock title="Специалисты" subtitle="Выберите, кто нужен" />
        <View className="mb-6 px-4">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Например, электрик или уборка"
          />
        </View>
        {sections.map(({ section, rows }) => {
          const SectionIcon = getCategoryIcon(section.icon);
          return (
            <InsetGroup key={section.id} title={section.name_ru}>
              <InsetRow
                title="Весь раздел"
                subtitle={section.name_ru}
                icon={<SectionIcon size={18} weight="bold" color={tc["on-accent"]} />}
                iconAccent
                navigates
                onPress={() => openSection(section.id)}
              />
              {rows.map((c, i) => {
                const Icon = getCategoryIcon(c.icon);
                return (
                  <InsetRow
                    key={c.id}
                    title={c.name_ru}
                    icon={<Icon size={18} weight="bold" color={tc.ink} />}
                    navigates
                    onPress={() => openCategory(c.id)}
                    last={i === rows.length - 1}
                  />
                );
              })}
            </InsetGroup>
          );
        })}
      </Animated.ScrollView>
      <LargeTitleBar
        title="Специалисты"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />
    </View>
  );
}
