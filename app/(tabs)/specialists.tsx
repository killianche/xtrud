/**
 * Вкладка «Специалисты» — сначала категория, потом люди (DECISION владельца
 * 2026-09-07: «когда кликаем на специалисты, пусть открывается список
 * категорий; выбрал — открываются сами специалисты»). Разделы каталога
 * группами, первая строка — «Весь раздел», внутри — категории. Тап ведёт на
 * /specialists/section (экран стека — свайп назад работает).
 */

import { useRouter } from "expo-router";
import { CaretDown, SignIn } from "phosphor-react-native";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  type FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  type ScrollView,
  UIManager,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import {
  InsetGroup,
  InsetRow,
  LargeTitleBar,
  SearchField,
  SegmentedControl,
  useLargeTitle,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useUnreadReviewsCount } from "@/features/notifications/use-notifications";
import { SpecialistHubBody } from "@/features/specialist/SpecialistHubBody";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColors } from "@/lib/use-theme-color";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SpecialistsCategoriesScreen() {
  const router = useRouter();
  // Строки навигации в покое нет — стартовая высота 0, без прыжка (QA).
  const large = useLargeTitle();
  const tabBarSpace = useTabBarSpace();
  const tc = useThemeColors(["ink", "on-accent", "mute"]);
  const [query, setQuery] = useState("");
  // Переключатель «Найти специалиста / Я специалист» — как «Как клиент / Как
  // мастер» в «Моих заданиях» (DECISION владельца 2026-09-08).
  type Segment = "find" | "me";
  const [segment, setSegment] = useState<Segment>("find");
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  // Новый отзыв — счётчик на «Я специалист», как у бейджа вкладки.
  const unreadReviews = useUnreadReviewsCount(userId).data ?? 0;
  // Раздел раскрывается по тапу — как DisclosureGroup в iOS (DECISION
  // владельца 2026-09-07: «крупные категории большими, мелкие скрыты и
  // раскрываются»). Поиск раскрывает совпавшие разделы сам.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => {
    hapticSelection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
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
        {segment === "me" ? (
          !userId ? (
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
          )
        ) : null}
        <View className={segment === "find" ? "mb-6 px-4" : "hidden"}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Например, электрик или уборка"
          />
        </View>
        {segment !== "find" ? null : l1.isLoading || categories.isLoading ? (
          <View className="mx-4 overflow-hidden rounded-2xl bg-canvas">
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} className="flex-row items-center gap-3 px-4 py-3.5">
                <Skeleton width={36} height={36} className="rounded-lg" />
                <Skeleton height={17} className="flex-1 rounded" />
              </View>
            ))}
          </View>
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
        ) : sections.length === 0 ? (
          <InsetGroup footer="Ничего не нашли. Попробуйте другое слово.">
            <View className="h-1" />
          </InsetGroup>
        ) : null}
        {segment !== "find"
          ? null
          : sections.map(({ section, rows }) => {
              const SectionIcon = getCategoryIcon(section.icon);
              const expanded = open.has(section.id) || query.trim().length > 0;
              return (
                <View key={section.id} className="mb-3 px-4">
                  <View className="overflow-hidden rounded-2xl bg-canvas">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`${section.name_ru}, ${rows.length} категорий`}
                      onPress={() => toggle(section.id)}
                      className="flex-row items-center gap-3 px-4 py-4 active:bg-canvas-soft"
                    >
                      <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent">
                        <SectionIcon size={22} weight="bold" color={tc["on-accent"]} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <AppText
                          weight="bold"
                          className="text-ios-title2 text-ink"
                          numberOfLines={2}
                        >
                          {section.name_ru}
                        </AppText>
                        <AppText className="mt-0.5 text-ios-footnote text-mute">
                          {rows.length}{" "}
                          {rows.length === 1
                            ? "категория"
                            : rows.length < 5
                              ? "категории"
                              : "категорий"}
                        </AppText>
                      </View>
                      <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
                        <SystemIcon
                          sf="chevron.down"
                          fallback={CaretDown}
                          size={16}
                          weight="semibold"
                          color={tc.mute}
                        />
                      </View>
                    </Pressable>
                    {expanded ? (
                      <View className="border-t border-hairline">
                        <InsetRow
                          title="Весь раздел"
                          subtitle={`Все специалисты: ${section.name_ru.toLowerCase()}`}
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
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
      </Animated.ScrollView>
      <LargeTitleBar
        title="Специалисты"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        hideTitle
        alwaysCompact
        below={
          <SegmentedControl<Segment>
            value={segment}
            onChange={setSegment}
            items={[
              { id: "find", label: "Найти специалиста" },
              { id: "me", label: "Я специалист", tone: "primary", count: unreadReviews },
            ]}
          />
        }
      />
    </View>
  );
}
