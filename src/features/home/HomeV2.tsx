/**
 * HomeV2 — главная клиента, вариант `home_variant: "v2"` (по умолчанию),
 * docs/HOME_V2_2026-10.md (задача №353, роль `xtrud-designer`).
 *
 * Порядок блоков (§4.1): CinematicHero → MyOrdersShowcase (без изменений) →
 * **SpecialistsCarousel** (новый) → ActiveOrdersShowcase (та же вёрстка,
 * персонализированная логика отбора, §4.2) → PromoBannerCarousel → FAB.
 *
 * Герой (§5.1–5.2): растяжение фото при оттягивании, параллакс и угасание
 * заголовка при прокрутке, медленный Ken Burns — через `scrollY` на потоке
 * интерфейса; classic получает прежний неподвижный герой.
 *
 * Реализованы: §5.4 (каскадное появление 4 блоков один раз за загрузку),
 * §5.5 (снэп + масштаб/прозрачность карусели специалистов + haptic), §5.6
 * (press-scale карточки специалиста) — всё новое, не трогает
 * `CinematicHero`/`OrderRow`/`MasterCard`.
 */

import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type FlatList, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { FloatingActionButton } from "@/components/ui";
import { ActiveOrdersShowcase } from "@/features/home/ActiveOrdersShowcase";
import { CinematicHero } from "@/features/home/CinematicHero";
import type { HomeVariantProps } from "@/features/home/ClassicHome";
import {
  HOME_STATUS_BAR_COVER_OFFSET,
  HomeStatusBarCover,
} from "@/features/home/HomeStatusBarCover";
import { pickActiveOrdersL2Ids } from "@/features/home/home-personalization";
import { MyOrdersShowcase } from "@/features/home/MyOrdersShowcase";
import { PromoBannerCarousel } from "@/features/home/PromoBannerCarousel";
import { SpecialistsCarousel } from "@/features/home/SpecialistsCarousel";
import { useCascadeReveal } from "@/features/home/use-cascade-reveal";
import { useHomeSpecialists } from "@/features/home/use-home-specialists";
import { usePromoBanners } from "@/features/home/use-promo-banners";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import { useMyOrders } from "@/features/orders/use-my-orders";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColor } from "@/lib/use-theme-color";

const HOME_FAB_OFFSET = 320;
const HOME_FAB_HIDE_OFFSET = 240;

/** Каскад — ~300мс вход + 60мс шаг между 4 секциями (§5.4). */
const CASCADE_STEP_MS = 60;
const CASCADE_DURATION_MS = 300;
const CASCADE_EASING = Easing.bezier(0.23, 1, 0.32, 1);

export function HomeV2({ userId, refresh, onDescribeTask }: HomeVariantProps) {
  const tabBarSpace = useTabBarSpace();
  const canvasBg = useThemeColor("surface-page");

  const listRef = useRef<Animated.ScrollView>(null);
  const [showFab, setShowFab] = useState(false);
  const resetCounter = useTabScrollResetCounter("index");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);
  const [statusBarCovered, setStatusBarCovered] = useState(false);

  // Прокрутка — на потоке интерфейса (Reanimated): герой тянется, отстаёт и
  // гаснет без участия JS. В JS уходят только смены порогов (строка
  // состояния, плавающий «+») — тот же гистерезис, что в classic.
  const scrollY = useSharedValue(0);
  const coveredSV = useSharedValue(false);
  const fabSV = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler((event) => {
    const y = event.contentOffset.y;
    scrollY.value = y;
    const covered = y > HOME_STATUS_BAR_COVER_OFFSET;
    if (covered !== coveredSV.value) {
      coveredSV.value = covered;
      runOnJS(setStatusBarCovered)(covered);
    }
    const fab = fabSV.value ? y > HOME_FAB_HIDE_OFFSET : y > HOME_FAB_OFFSET;
    if (fab !== fabSV.value) {
      fabSV.value = fab;
      runOnJS(setShowFab)(fab);
    }
  });

  // Персонализация «Актуальных заданий» (§4.2): свои категории специалиста →
  // фильтр ленты; пусто — без фильтра, как в classic.
  const { data: myCategories, isLoading: categoriesLoading } = useMyMasterCategories(userId);
  const personalizedL2Ids = useMemo(
    () => pickActiveOrdersL2Ids(myCategories ?? []),
    [myCategories],
  );

  // Те же запросы, что внутри дочерних блоков (один queryKey → React Query
  // отдаёт кеш, без лишней сети) — нужны здесь только за `isLoading`, чтобы
  // разрешить каскад §5.4 одним общим гейтом на все 4 секции.
  const myOrdersLoading = useMyOrders(userId).isLoading;
  const specialistsLoading = useHomeSpecialists(userId).isLoading;
  const activeOrdersLoading =
    useAllOpenOrders({ userId, l2Ids: personalizedL2Ids }).isLoading || categoriesLoading;
  const promoLoading = usePromoBanners().isLoading;
  const sectionsLoading =
    myOrdersLoading || specialistsLoading || activeOrdersLoading || promoLoading;
  // Зафиксировано один раз при первом рендере (docs: use-cascade-reveal.ts) —
  // тёплый старт (данные уже в кеше) каскад не играет вовсе.
  const shouldAnimateIn = useCascadeReveal(sectionsLoading);

  return (
    <View style={{ flex: 1, backgroundColor: canvasBg }}>
      <Animated.ScrollView
        ref={listRef}
        style={{ flex: 1, backgroundColor: canvasBg }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
      >
        <CinematicHero onCreateTask={() => onDescribeTask()} scrollY={scrollY} kenBurns />

        <CascadeSection index={0} loading={sectionsLoading} shouldAnimate={shouldAnimateIn}>
          <MyOrdersShowcase userId={userId} />
        </CascadeSection>

        <CascadeSection index={1} loading={sectionsLoading} shouldAnimate={shouldAnimateIn}>
          <SpecialistsCarousel userId={userId} />
        </CascadeSection>

        <CascadeSection index={2} loading={sectionsLoading} shouldAnimate={shouldAnimateIn}>
          <ActiveOrdersShowcase userId={userId} l2Ids={personalizedL2Ids} />
        </CascadeSection>

        <CascadeSection index={3} loading={sectionsLoading} shouldAnimate={shouldAnimateIn}>
          <PromoBannerCarousel />
        </CascadeSection>
      </Animated.ScrollView>
      <HomeStatusBarCover visible={statusBarCovered} />
      {showFab ? (
        <FloatingActionButton label="Создать задание" onPress={() => onDescribeTask()} />
      ) : null}
    </View>
  );
}

/**
 * Обёртка каскадного появления (§5.4). Одна постоянная `Animated.View` —
 * без пересоздания детей (прежний вариант менял View на Animated.View и
 * монтировал блок заново: вспышка и съехавшая раскладка в веб-снимке).
 * Пока `loading` — блок виден как есть (внутри свой скелетон). На первом
 * переходе «загрузка → данные», если каскад разрешён, блок проявляется с
 * шагом CASCADE_STEP_MS и подъёмом 12 pt. «Уменьшение движения» —
 * ReduceMotion.System: сразу в финальном виде.
 */
function CascadeSection({
  index,
  loading,
  shouldAnimate,
  children,
}: {
  index: number;
  loading: boolean;
  shouldAnimate: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(1);
  const played = useRef(false);
  useEffect(() => {
    if (loading || !shouldAnimate || played.current) return;
    played.current = true;
    progress.value = 0;
    progress.value = withDelay(
      index * CASCADE_STEP_MS,
      withTiming(1, {
        duration: CASCADE_DURATION_MS,
        easing: CASCADE_EASING,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [loading, shouldAnimate, index, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
