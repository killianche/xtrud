/**
 * «Найти задание» — сначала выбор, потом задания (владелец, 2026-10-03:
 * «когда заходим на „Найти задание“, открывается список категорий; человек
 * выбирает категорию, сразу подкатегорию, и только тогда смотрит задания.
 * Сделай как на Airbnb устроен поиск жилья»).
 *
 * Как у Airbnb: шаги — карточки, раскрытая одна. «Какая работа?» → «Где?»;
 * выбранный шаг сворачивается в строку «Работа · Электрика», по тапу
 * раскрывается снова. Розовая кнопка показывает, сколько заданий найдётся
 * («Показать 5 заданий»), — число посчитано по открытым заданиям, а не
 * придумано (design-quality §5). Задания — на следующем экране
 * (/find/results), его шапка хранит выбор.
 *
 * Поиск по заданиям текстом убран: поле в карточке ищет работу (категорию,
 * в том числе по словам вроде «розетка»), как поле «Куда?» у Airbnb.
 */

import { useRouter } from "expo-router";
import { CaretLeft, MagnifyingGlass } from "phosphor-react-native";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Animated, LayoutAnimation, Platform, Pressable, UIManager, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { FilterChip } from "@/components/ui/FilterChip";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { InsetRow } from "@/components/ui/InsetList";
import { LargeTitleBlock, type useLargeTitle } from "@/components/ui/LargeTitle";
import { SearchField } from "@/components/ui/SearchField";
import { Skeleton } from "@/components/ui/Skeleton";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { districtOptions } from "@/features/orders/order-schema";
import { useOrdersSearchFiltersStore } from "@/features/orders/orders-search-filters-store";
import { tasksLabel } from "@/features/orders/plural-ru";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { CARD_SHADOW } from "@/lib/shadows";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";
import { countByCategory, countInCategories } from "./open-order-facets";
import { useOpenOrderFacets } from "./use-open-order-facets";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Step = "what" | "where" | null;

/** Место под закреплённой панелью «Очистить / Показать»: 56 + 16 + зазор. */
const ACTION_BAR_SPACE = 88;

export function FindSearch({
  contentTop,
  onScroll,
}: {
  contentTop: number;
  onScroll: ReturnType<typeof useLargeTitle>["onScroll"];
}) {
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["ink", "mute", "accent", "on-accent"]);
  // Шаги сворачиваются плавно; при «Уменьшении движения» — сразу.
  const reducedMotion = useReducedMotion();
  const animateNext = () => {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const l2Ids = useOrdersSearchFiltersStore((s) => s.l2Ids);
  const cityId = useOrdersSearchFiltersStore((s) => s.cityId);
  const district = useOrdersSearchFiltersStore((s) => s.district);
  const setL2Ids = useOrdersSearchFiltersStore((s) => s.setL2Ids);
  const setLocation = useOrdersSearchFiltersStore((s) => s.setLocation);
  const clearAll = useOrdersSearchFiltersStore((s) => s.clearAll);
  const l2Id = l2Ids.length === 1 ? (l2Ids[0] ?? null) : null;

  // Вход на вкладку снимает бейдж новых заданий — как раньше в ленте.
  const markSeen = useMarkFeedSeen(userId).mutate;
  useEffect(() => {
    if (userId) markSeen();
  }, [userId, markSeen]);

  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  const cities = useCities();
  const facets = useOpenOrderFacets(userId);

  // Возврат с результатов: выбор сохранён — шаги свёрнуты, видна кнопка.
  const [step, setStep] = useState<Step>(() => (l2Id ? null : "what"));
  const [openL1, setOpenL1] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const place = useMemo(() => ({ cityId, district }), [cityId, district]);
  const allCounts = useMemo(() => countByCategory(facets.data ?? []), [facets.data]);
  const placeCounts = useMemo(
    () => countByCategory(facets.data ?? [], place),
    [facets.data, place],
  );

  const category = categories.data?.find((c) => c.id === l2Id) ?? null;
  const placeLabel = cityId
    ? (cities.data?.find((c) => c.id === cityId)?.name ?? "Город")
    : district || "Вся Ингушетия";
  const resultCount = l2Id && facets.data ? (placeCounts.get(l2Id) ?? 0) : null;
  // Ноль известен заранее — кнопка не ведёт на пустой экран, а говорит это
  // сама (QA 2026-10-03); место или работу можно сменить выше.
  const nothingFound = resultCount === 0;
  const ctaLabel =
    resultCount === null
      ? "Показать задания"
      : nothingFound
        ? "Здесь пока нет заданий"
        : `Показать ${tasksLabel(resultCount)}`;

  const pickCategory = (id: string) => {
    hapticSelection();
    animateNext();
    setL2Ids([id]);
    setQuery("");
    setStep("where");
  };
  const pickPlace = (nextCity: string, nextDistrict: string) => {
    hapticSelection();
    animateNext();
    setLocation(nextCity, nextDistrict);
    setStep(null);
  };
  const openStep = (next: Step) => {
    hapticSelection();
    animateNext();
    setStep(next);
  };
  const reset = () => {
    hapticSelection();
    animateNext();
    clearAll();
    setOpenL1(null);
    setQuery("");
    setStep("what");
  };

  return (
    <>
      <Animated.ScrollView
        contentContainerStyle={{
          paddingTop: contentTop,
          paddingBottom: tabBarSpace + (l2Id ? ACTION_BAR_SPACE : 16),
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <LargeTitleBlock title="Найти задание" />

        <View className="gap-3 px-4">
          <StepCard
            title="Какая работа?"
            label="Работа"
            value={category?.name_ru ?? "Выберите"}
            expanded={step === "what"}
            onExpand={() => {
              // Раскрыли снова — сразу в разделе выбранной категории.
              if (category) setOpenL1(category.l1_id);
              openStep("what");
            }}
          >
            <View className="px-4 pb-3 pt-4">
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Например, электрик или уборка"
                showCancel={false}
              />
            </View>
            <WhatList
              query={query}
              openL1={openL1}
              setOpenL1={(id) => {
                hapticSelection();
                animateNext();
                setOpenL1(id);
              }}
              selectedId={l2Id}
              counts={facets.data ? allCounts : null}
              facetsRows={facets.data ?? null}
              l1={l1}
              categories={categories}
              onPick={pickCategory}
            />
          </StepCard>

          <StepCard
            title="Где?"
            label="Где"
            value={placeLabel}
            expanded={step === "where"}
            onExpand={() => openStep("where")}
          >
            <View className="gap-3 px-4 pb-5 pt-4">
              <View className="flex-row flex-wrap gap-2">
                <FilterChip
                  label="Вся Ингушетия"
                  active={!cityId && !district}
                  chevron={false}
                  onPress={() => pickPlace("", "")}
                />
                {(cities.data ?? []).map((c) => (
                  <FilterChip
                    key={c.id}
                    label={c.name}
                    active={cityId === c.id}
                    chevron={false}
                    onPress={() => pickPlace(c.id, "")}
                  />
                ))}
              </View>
              <AppText className="mt-1 text-ios-footnote text-mute">Районы</AppText>
              <View className="flex-row flex-wrap gap-2">
                {districtOptions.map((d) => (
                  <FilterChip
                    key={d}
                    label={d}
                    active={district === d}
                    chevron={false}
                    onPress={() => pickPlace("", d)}
                  />
                ))}
              </View>
            </View>
          </StepCard>
        </View>
      </Animated.ScrollView>
      {l2Id ? (
        // Как нижняя панель поиска Airbnb: «Очистить» и главная кнопка,
        // закреплены над нижним меню — видны, сколько бы ни раскрылось выше.
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 12 }}
        >
          <GlassSurface
            fallbackClassName="border border-hairline bg-canvas"
            style={{ borderRadius: 24, overflow: "hidden" }}
          >
            <View className="flex-row items-center gap-3 p-2 pl-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Очистить выбор"
                onPress={reset}
                hitSlop={8}
                className="min-h-14 justify-center px-2 active:opacity-60"
              >
                <AppText weight="semibold" className="text-ios-body text-ink underline">
                  Очистить
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ctaLabel}
                accessibilityState={{ disabled: nothingFound }}
                disabled={nothingFound}
                onPress={() => router.push("/find/results" as never)}
                className={`min-h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl px-5 ${
                  nothingFound ? "bg-canvas-soft-2" : "bg-accent active:opacity-85"
                }`}
              >
                {nothingFound ? null : (
                  <SystemIcon
                    sf="magnifyingglass"
                    fallback={MagnifyingGlass}
                    size={18}
                    weight="bold"
                    color={tc["on-accent"]}
                  />
                )}
                <AppText
                  weight="semibold"
                  className={`text-ios-body ${nothingFound ? "text-mute" : "text-on-accent"}`}
                  numberOfLines={1}
                >
                  {ctaLabel}
                </AppText>
              </Pressable>
            </View>
          </GlassSurface>
        </View>
      ) : null}
    </>
  );
}

/** Шаг поиска: раскрытый — заголовок и содержимое; свёрнутый — строка-итог. */
function StepCard({
  title,
  label,
  value,
  expanded,
  onExpand,
  children,
}: {
  title: string;
  label: string;
  value: string;
  expanded: boolean;
  onExpand: () => void;
  children: ReactNode;
}) {
  return (
    <View className="overflow-hidden rounded-3xl bg-surface-card" style={CARD_SHADOW}>
      {expanded ? (
        <>
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="px-5 pt-5 text-ios-title1 text-ink"
          >
            {title}
          </AppText>
          {children}
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value}. Изменить`}
          onPress={onExpand}
          className="min-h-16 flex-row items-center gap-3 px-5 py-4 active:bg-canvas-soft"
        >
          <AppText className="text-ios-body text-mute">{label}</AppText>
          <AppText
            weight="semibold"
            className="flex-1 text-right text-ios-body text-ink"
            numberOfLines={2}
          >
            {value}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

type L1Query = ReturnType<typeof useCategoriesL1>;
type L2Query = ReturnType<typeof useVisibleCategories>;

/** Содержимое шага «Какая работа?»: разделы → категории раздела, или поиск. */
function WhatList({
  query,
  openL1,
  setOpenL1,
  selectedId,
  counts,
  facetsRows,
  l1,
  categories,
  onPick,
}: {
  query: string;
  openL1: string | null;
  setOpenL1: (id: string | null) => void;
  selectedId: string | null;
  /** Задания по категориям; null — ещё не посчитаны (число не показываем). */
  counts: Map<string, number> | null;
  facetsRows: Parameters<typeof countInCategories>[0] | null;
  l1: L1Query;
  categories: L2Query;
  onPick: (l2Id: string) => void;
}) {
  const tc = useThemeColors(["ink", "accent"]);
  const q = query.trim().toLowerCase();
  const search = useSearchCategories(q, 12);

  const countLabel = (n: number | undefined) =>
    counts === null ? undefined : n ? String(n) : undefined;
  // VoiceOver: «Двери, 1 задание», а не «Двери, 1».
  const rowLabel = (name: string, n: number | undefined) =>
    counts === null || n === undefined ? name : `${name}, ${n > 0 ? tasksLabel(n) : "заданий нет"}`;

  if (l1.isLoading || categories.isLoading) {
    return (
      <View className="pb-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} className="flex-row items-center gap-3 px-4 py-3.5">
            <Skeleton width={36} height={36} className="rounded-lg" />
            <Skeleton height={17} className="flex-1 rounded" />
          </View>
        ))}
      </View>
    );
  }
  if (l1.error || categories.error) {
    return (
      <View className="px-5 pb-5">
        <AppText className="text-ios-body text-mute">Не удалось загрузить категории.</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Повторить загрузку категорий"
          onPress={() => {
            void l1.refetch();
            void categories.refetch();
          }}
          className="mt-3 min-h-11 self-start justify-center active:opacity-60"
        >
          <AppText weight="semibold" className="text-ios-body text-accent">
            Повторить
          </AppText>
        </Pressable>
      </View>
    );
  }

  const all = categories.data ?? [];

  if (q.length > 0) {
    // Сначала совпадения по названию (мгновенно, без сети), затем — по
    // словам каталога («розетка» → Электрика) из search_categories.
    const ids: string[] = [];
    const hint = new Map<string, string>();
    for (const c of all) if (c.name_ru.toLowerCase().includes(q)) ids.push(c.id);
    for (const hit of search.data?.hits ?? []) {
      if (!all.some((c) => c.id === hit.l2_id)) continue;
      if (!ids.includes(hit.l2_id)) ids.push(hit.l2_id);
      if (hit.kind === "l3" && !hint.has(hit.l2_id)) hint.set(hit.l2_id, hit.name_ru);
    }
    if (ids.length === 0) {
      return (
        <AppText className="px-5 pb-5 text-ios-body text-mute">
          {search.isFetching ? "Ищем…" : "Ничего не нашли. Попробуйте другое слово."}
        </AppText>
      );
    }
    return (
      <View className="pb-1">
        {ids.map((id, i) => {
          const c = all.find((x) => x.id === id);
          if (!c) return null;
          const Icon = getCategoryIcon(c.icon);
          return (
            <InsetRow
              key={id}
              title={c.name_ru}
              subtitle={hint.get(id)}
              icon={<Icon size={18} weight="bold" color={tc.ink} />}
              value={countLabel(counts?.get(id))}
              accessibilityLabel={rowLabel(c.name_ru, counts?.get(id))}
              checked={id === selectedId}
              onPress={() => onPick(id)}
              last={i === ids.length - 1}
            />
          );
        })}
      </View>
    );
  }

  const section = openL1 ? (l1.data ?? []).find((s) => s.id === openL1) : null;
  if (section) {
    const rows = all.filter((c) => c.l1_id === section.id);
    return (
      <View className="pb-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад ко всем разделам"
          onPress={() => setOpenL1(null)}
          className="min-h-11 flex-row items-center gap-1 px-4 active:opacity-60"
        >
          <SystemIcon
            sf="chevron.left"
            fallback={CaretLeft}
            size={15}
            weight="semibold"
            color={tc.accent}
          />
          <AppText className="text-ios-body text-accent">Все разделы</AppText>
        </Pressable>
        <AppText weight="semibold" className="px-4 pb-1 pt-2 text-ios-title2 text-ink">
          {section.name_ru}
        </AppText>
        {rows.map((c, i) => {
          const Icon = getCategoryIcon(c.icon);
          return (
            <InsetRow
              key={c.id}
              title={c.name_ru}
              icon={<Icon size={18} weight="bold" color={tc.ink} />}
              value={countLabel(counts?.get(c.id))}
              accessibilityLabel={rowLabel(c.name_ru, counts?.get(c.id))}
              checked={c.id === selectedId}
              onPress={() => onPick(c.id)}
              last={i === rows.length - 1}
            />
          );
        })}
      </View>
    );
  }

  // Разделы с заданиями — первыми (как популярные направления у Airbnb),
  // дальше — в порядке каталога. Число справа, как счётчик папок в Почте.
  const sections = (l1.data ?? [])
    .map((s, order) => {
      const ids = new Set(all.filter((c) => c.l1_id === s.id).map((c) => c.id));
      return { s, ids, order, n: facetsRows ? countInCategories(facetsRows, ids) : 0 };
    })
    .filter(({ ids }) => ids.size > 0)
    .sort((a, b) => Number(b.n > 0) - Number(a.n > 0) || a.order - b.order);
  return (
    <View className="pb-1">
      {sections.map(({ s, n }, i) => {
        const Icon = getCategoryIcon(s.icon);
        return (
          <InsetRow
            key={s.id}
            title={s.name_ru}
            icon={<Icon size={18} weight="bold" color={tc.accent} />}
            value={facetsRows && n > 0 ? String(n) : undefined}
            accessibilityLabel={rowLabel(s.name_ru, facetsRows ? n : undefined)}
            navigates
            onPress={() => setOpenL1(s.id)}
            last={i === sections.length - 1}
          />
        );
      })}
    </View>
  );
}
