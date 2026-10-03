/**
 * Главная клиента — TaskRabbit-style hybrid home.
 *
 * Структура (зоны 1-6 из дизайн-плана):
 *   1. Top-bar (sticky): лого xtrud + CitySelector + Войти/Аватар
 *   2. Hero: H1 + поиск + CTA "Описать задачу" + соцпруф
 *   3. Актуальные задания и промо-баннеры.
 *   Блока категорий нет с 2026-10-03 (владелец) — разделы во вкладках.
 *
 * Auth-логика:
 *   - Анон может всё смотреть.
 *   - Тап «Создать задание» → /orders/new (на финальной отправке login wall)
 *   - Тап карточки исполнителя → /master/[id]
 *
 * Master-режим (если active_role === "master") — отдельный экран MasterHomeContent.
 */

import { useRouter } from "expo-router";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { type FlatList, ScrollView, View } from "react-native";
import { FloatingActionButton } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { ActiveOrdersShowcase } from "@/features/home/ActiveOrdersShowcase";
import { CinematicHero } from "@/features/home/CinematicHero";
import {
  HOME_STATUS_BAR_COVER_OFFSET,
  HomeStatusBarCover,
} from "@/features/home/HomeStatusBarCover";
import { MyOrdersShowcase } from "@/features/home/MyOrdersShowcase";
import { PromoBannerCarousel } from "@/features/home/PromoBannerCarousel";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColor } from "@/lib/use-theme-color";

export default function HomeTab() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const refresh = usePullToRefresh();

  // Одна главная на всех. DECISION владельца 2026-09-01: есть аккаунт, с него
  // можно выложить задание и откликнуться на чужое; отдельного «режима
  // мастера» нет.
  //
  // Развилка по active_role была не просто дублированием экрана: чтобы
  // откликнуться, человеку приходилось СНАЧАЛА переключить режим, иначе он не
  // видел нужной кнопки. Это и была та тяжесть, которую владелец просил убрать.
  //
  // Экран мастера ничего уникального не терял: его лента открытых заданий —
  // это блок «Актуальные задания», который есть здесь, а «Найти задание» —
  // отдельная вкладка нижнего меню.
  return (
    <ClientHome
      userId={userId}
      refresh={refresh}
      onDescribeTask={(draft) => {
        // Передаём текст черновика в визард — orders/new подхватит его как
        // начальное значение поля description.
        const url = draft ? `/orders/new?draft=${encodeURIComponent(draft)}` : "/orders/new";
        router.push(url as never);
      }}
    />
  );
}

// ============================================================================
// Master home — фото-герой + дискавери-блоки. Контент MasterHomeContent
// ограничен ~10 карточками (см. её комментарий), не растёт от прокрутки
// пользователя — обычный ScrollView, не FlashList.
// ============================================================================

// ============================================================================
// Client home — Hero + Featured + Categories + Top masters.
//
// Виртуализация (2026-08-30): единственный реально растущий список на
// главной — «Все категории» (таксономия L2, сейчас ~48 записей, admin-
// managed, порог ≤15 для plain ScrollView из docs/IOS_FOUNDATION.md §6.1
// превышен). Поэтому весь экран клиента — один FlashList, где категории —
// его `data`, а всё остальное (hero, промо, топ-мастера) — ListHeaderComponent.
// Вложенный FlashList в ScrollView не работает (warning о nested
// virtualization) — по этой же причине здесь нельзя оставить прежний
// ScrollView с .map() внутри.
//
// NB: TopBar (логотип + город + лимит откликов на canvas) удалён 2026-05-24.
// Раньше рендерился только для мастера; теперь его роль выполняет фото-герой
// MasterCinematicHero (логотип/лимит/город лежат поверх фото). У клиента
// шапка давно живёт внутри CinematicHero.
// ============================================================================

interface ClientHomeProps {
  userId: string | undefined;
  refresh: ReturnType<typeof usePullToRefresh>;
  /** Принимает черновик описания задачи (если пользователь начал писать в hero-input). */
  onDescribeTask: (draft?: string) => void;
}

/** Прокрутка, после которой на главной показывается плавающий «+». */
const HOME_FAB_OFFSET = 320;
/** Порог скрытия ниже порога показа — без мигания у границы (QA). */
const HOME_FAB_HIDE_OFFSET = 240;

function ClientHome({ userId, refresh, onDescribeTask }: ClientHomeProps) {
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

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// DescribeTaskCallout вынесен в `src/features/home/DescribeTaskCallout.tsx`
// (редизайн 2026-05-21, версия 3): тёмная брендовая spotlight-карточка «Не
// нашли мастера? Создайте заказ» вместо иллюстрации на canvas. Предыдущие
// версии (серая карточка с 3 шагами / иллюстрация чек-лист) — в git history.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Hero вынесен в `src/features/home/CinematicHero.tsx` (2026-05-21):
// full-bleed фото-герой (Farce-style) вместо «H1 + поиск + квадратная картинка».
// ----------------------------------------------------------------------------
