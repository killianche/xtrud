/**
 * Вкладка «Специалисты» — сначала категория, потом люди (DECISION владельца
 * 2026-09-07: «когда кликаем на специалисты, пусть открывается список
 * категорий; выбрал — открываются сами специалисты»). С 2026-10-03 (№158) —
 * три уровня, как в «Найти задание»: разделы карточками → /specialists/category
 * (подразделы, первой строкой «Все специалисты раздела») →
 * /specialists/section (люди). Каждый уровень — экран стека со свайпом назад.
 */

import { useRouter } from "expo-router";
import { MagnifyingGlass, SignIn, UserCircle } from "phosphor-react-native";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Animated, type FlatList, type ScrollView, View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import {
  InsetGroup,
  InsetRow,
  LargeTitleBar,
  SearchField,
  SegmentedControl,
  useLargeTitle,
} from "@/components/ui";
import { SegmentPager } from "@/components/ui/SegmentPager";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { CategoryMatches } from "@/features/categories/CategoryMatches";
import { SectionGrid, SectionGridSkeleton } from "@/features/categories/SectionGrid";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useUnreadReviewsCount } from "@/features/notifications/use-notifications";
import { pluralRu } from "@/features/orders/plural-ru";
import { SpecialistHubBody } from "@/features/specialist/SpecialistHubBody";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";

export default function SpecialistsCategoriesScreen() {
  const router = useRouter();
  // Строки навигации в покое нет — стартовая высота 0, без прыжка (QA).
  const large = useLargeTitle();
  const tabBarSpace = useTabBarSpace();
  const [query, setQuery] = useState("");
  // Переключатель «Найти специалиста / Я специалист» — как «Как клиент / Как
  // мастер» в «Моих заданиях» (DECISION владельца 2026-09-08).
  type Segment = "find" | "me";
  const [segment, setSegment] = useState<Segment>("find");
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  // Новый отзыв — счётчик на «Я специалист», как у бейджа вкладки.
  const unreadReviews = useUnreadReviewsCount(userId).data ?? 0;
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();

  const scrollRef = useRef<ScrollView>(null);
  // У каждой страницы пейджера свой скролл: повторный тап по вкладке
  // поднимает обе (QA 2026-10-03 — раньше «Я специалист» не реагировала).
  const meScrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("specialists");
  useEffect(() => {
    if (resetCounter === 0) return;
    scrollViewToTop(scrollRef as unknown as RefObject<FlatList | null>);
    scrollViewToTop(meScrollRef as unknown as RefObject<FlatList | null>);
  }, [resetCounter]);

  // Разделы карточками; тап — экран подразделов (владелец, 2026-10-03,
  // №158: раскрытие на месте «получше, но не идеально» — нужен переход).
  const tiles = useMemo(() => {
    const all = categories.data ?? [];
    return (l1.data ?? [])
      .map((s) => ({ s, n: all.filter((c) => c.l1_id === s.id).length }))
      .filter(({ n }) => n > 0)
      .map(({ s, n }) => ({
        id: s.id,
        name: s.name_ru,
        icon: s.icon,
        meta: `${n} ${pluralRu(n, "категория", "категории", "категорий")}`,
      }));
  }, [l1.data, categories.data]);

  const openSection = (l1Id: string) =>
    router.push({ pathname: "/specialists/category", params: { l1: l1Id } } as never);
  const openCategory = (l2Id: string) =>
    router.push({ pathname: "/specialists/section", params: { l2: l2Id } } as never);

  return (
    <View className="flex-1 bg-surface-page">
      {/* Две страницы — свайп по экрану и тап по сегменту (владелец,
          2026-10-03), как на «Мои задания». */}
      <SegmentPager
        page={segment === "me" ? 1 : 0}
        onPageChange={(index) => setSegment(index === 1 ? "me" : "find")}
      >
        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
          onScroll={large.onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-6 mt-3 px-4">
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
            <SectionGrid tiles={tiles} onPress={openSection} />
          )}
        </Animated.ScrollView>
        <Animated.ScrollView
          ref={meScrollRef}
          contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
          onScroll={large.onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {!userId ? (
            <EmptyState
              icon={SignIn}
              title="Войдите, чтобы настроить профиль специалиста"
              hint="Категории, о себе, фото работ и контакты — клиенты найдут вас в каталоге."
              ctaLabel="Войти"
              onCtaPress={() => router.push("/(auth)/phone" as never)}
            />
          ) : (
            // Каждый аккаунт — специалист (DECISION 2026-09-11): экрана
            // «Станьте специалистом» больше нет, настройки видны сразу.
            <SpecialistHubBody userId={userId} />
          )}
        </Animated.ScrollView>
      </SegmentPager>
      <LargeTitleBar
        title="Специалисты"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        hideTitle
        alwaysCompact
        belowFloating
        below={
          <SegmentedControl<Segment>
            bare
            value={segment}
            onChange={setSegment}
            items={[
              { id: "find", label: "Найти специалиста", icon: MagnifyingGlass },
              {
                id: "me",
                label: "Я специалист",
                tone: "primary",
                count: unreadReviews,
                icon: UserCircle,
              },
            ]}
          />
        }
      />
    </View>
  );
}
