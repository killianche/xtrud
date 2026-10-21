/**
 * ClassicHome — главная клиента, вариант `home_variant: "classic"`.
 *
 * Перенесена БЕЗ ИЗМЕНЕНИЯ ПОВЕДЕНИЯ из `app/(tabs)/index.tsx` при вводе
 * флага `home_variant` (docs/HOME_V2_2026-10.md, задача №353): это точка
 * откатa, если новая версия («v2», `HomeV2.tsx`) не подойдёт. По умолчанию
 * показывается v2 (`useAppFlags().homeVariant === "v2"`); этот файл рендерят
 * только явным откатом с сервера.
 *
 * Структура (как было до v2): CinematicHero → MyOrdersShowcase →
 * ActiveOrdersShowcase (без персонализации) → PromoBannerCarousel → FAB —
 * один вертикальный `ScrollView`, без анимаций каскада/карусели специалистов.
 */

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { type FlatList, ScrollView, View } from "react-native";
import { FloatingActionButton } from "@/components/ui";
import { ActiveOrdersShowcase } from "@/features/home/ActiveOrdersShowcase";
import { CinematicHero } from "@/features/home/CinematicHero";
import {
  HOME_STATUS_BAR_COVER_OFFSET,
  HomeStatusBarCover,
} from "@/features/home/HomeStatusBarCover";
import { MyOrdersShowcase } from "@/features/home/MyOrdersShowcase";
import { PromoBannerCarousel } from "@/features/home/PromoBannerCarousel";
import type { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColor } from "@/lib/use-theme-color";

export interface HomeVariantProps {
  userId: string | undefined;
  refresh: ReturnType<typeof usePullToRefresh>;
  /** Принимает черновик описания задачи (если пользователь начал писать в hero-input). */
  onDescribeTask: (draft?: string) => void;
}

/** Прокрутка, после которой на главной показывается плавающий «+». */
const HOME_FAB_OFFSET = 320;
/** Порог скрытия ниже порога показа — без мигания у границы (QA). */
const HOME_FAB_HIDE_OFFSET = 240;

export function ClassicHome({ userId, refresh, onDescribeTask }: HomeVariantProps) {
  const tabBarSpace = useTabBarSpace();
  // Блока «Категории специалистов» на главной больше нет (владелец,
  // 2026-10-03: «полностью удалить этот блок») — разделы живут во вкладках
  // «Найти задание» и «Специалисты».
  // Фон страницы чуть темнее карточек — см. src/lib/colors.ts, surface-page.
  const canvasBg = useThemeColor("surface-page");

  // Tap-on-active-tab → scroll to top.
  const listRef = useRef<ScrollView>(null);
  const [showFab, setShowFab] = useState(false);
  const resetCounter = useTabScrollResetCounter("index");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  const [statusBarCovered, setStatusBarCovered] = useState(false);

  return (
    // Закреплённого поля поиска над главной нет: DECISION владельца
    // 2026-09-02 (вечер) — «полоску „что нужно сделать“ полностью убрать».
    // Фото-герой идёт от самого верха экрана.
    <View style={{ flex: 1, backgroundColor: canvasBg }}>
      <ScrollView
        ref={listRef}
        style={{ flex: 1, backgroundColor: canvasBg }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        // Строка состояния: пока виден герой, её защищает собственный тёмный
        // градиент фото; как только герой уходит вверх — включаем непрозрачную
        // полосу (DECISION владельца 2026-09-03). setState — только на смене.
        scrollEventThrottle={32}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          const next = y > HOME_STATUS_BAR_COVER_OFFSET;
          setStatusBarCovered((prev) => (prev === next ? prev : next));
          // Плавающий «+» появляется, когда герой с кнопкой ушёл вверх
          // (DECISION владельца 2026-09-07).
          setShowFab((prev) => (prev ? y > HOME_FAB_HIDE_OFFSET : y > HOME_FAB_OFFSET));
        }}
        // Фото-hero идёт от самого верха экрана (под статус-бар): paddingTop
        // не добавляем — CinematicHero сам учитывает inset.
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
      >
        <CinematicHero onCreateTask={() => onDescribeTask()} />
        {/* Свои открытые задания — первыми, если есть (владелец, 2026-10-03). */}
        <MyOrdersShowcase userId={userId} />
        <ActiveOrdersShowcase userId={userId} />
        {/* Promo-баннеры партнёров (рекламные фото-баннеры 16:9). */}
        <PromoBannerCarousel />
      </ScrollView>
      <HomeStatusBarCover visible={statusBarCovered} />
      {showFab ? (
        <FloatingActionButton label="Создать задание" onPress={() => onDescribeTask()} />
      ) : null}
    </View>
  );
}
