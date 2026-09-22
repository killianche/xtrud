/**
 * Главная клиента — TaskRabbit-style hybrid home.
 *
 * Структура (зоны 1-6 из дизайн-плана):
 *   1. Top-bar (sticky): лого xtrud + CitySelector + Войти/Аватар
 *   2. Hero: H1 + поиск + CTA "Описать задачу" + соцпруф
 *   3. Featured вертикали: клининг + срочный ремонт (крупные plate-карточки)
 *   4. Top-rated мастера (горизонтальная карусель, рендерится только если data >= 3)
 *   5. Все категории (сетка 2 col на mobile, 3-4 на web)
 *   6. (опционально) безопасность/доверие футер
 *
 * Auth-логика:
 *   - Анон может всё смотреть.
 *   - Тап «Создать задание» → /orders/new (на финальной отправке login wall)
 *   - Тап карточки исполнителя → /master/[id]
 *   - Тап категории → /category/[id]
 *
 * Master-режим (если active_role === "master") — отдельный экран MasterHomeContent.
 */

import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { CaretRight } from "phosphor-react-native";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { type FlatList, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FloatingActionButton } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { type CategoryL1, useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { ActiveOrdersShowcase } from "@/features/home/ActiveOrdersShowcase";
import { CinematicHero } from "@/features/home/CinematicHero";
import {
  HOME_STATUS_BAR_COVER_OFFSET,
  HomeStatusBarCover,
} from "@/features/home/HomeStatusBarCover";
import { PromoBannerCarousel } from "@/features/home/PromoBannerCarousel";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { getCategoryIcon } from "@/lib/category-icons";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useAppWidth } from "@/lib/use-app-width";
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
      onCategoryPress={(id) =>
        router.push({ pathname: "/specialists/section", params: { l1: id } } as never)
      }
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
  onCategoryPress: (id: string) => void;
  /** Принимает черновик описания задачи (если пользователь начал писать в hero-input). */
  onDescribeTask: (draft?: string) => void;
}

// Раскладка сетки категорий на широком экране — 2/3 колонки (см. прежнюю
// AllCategories). Плитка тянет свой gutter через paddingHorizontal — контейнер
// компенсирует внешние 20px через CONTAINER_HORIZONTAL_PADDING.
const CATEGORY_TILE_GUTTER = 6;
const CATEGORY_SCREEN_PADDING = 20;
const CATEGORY_CONTAINER_PADDING = CATEGORY_SCREEN_PADDING - CATEGORY_TILE_GUTTER;

/** Прокрутка, после которой на главной показывается плавающий «+». */
const HOME_FAB_OFFSET = 320;
/** Порог скрытия ниже порога показа — без мигания у границы (QA). */
const HOME_FAB_HIDE_OFFSET = 240;

function ClientHome({ userId, refresh, onCategoryPress, onDescribeTask }: ClientHomeProps) {
  const tabBarSpace = useTabBarSpace();
  // DECISION владельца 2026-09-05: на главной — крупные разделы («Ремонт и
  // отделка», «Сантехника и электрика»…), а детальные категории внутри.
  // Плоский список из 42 строк ушёл; тап по разделу ведёт на «Специалисты» с
  // фильтром по этому разделу.
  const { data: categories, isLoading, error, refetch } = useCategoriesL1();
  const width = useAppWidth();
  // Фон страницы чуть темнее карточек — см. src/lib/colors.ts, surface-page.
  const canvasBg = useThemeColor("surface-page");
  // На desktop колонок 2-3 (Lazyweb-паттерн: afterpay/people/zara — категории
  // в marketplace на широком вьюпорте подаются grid'ом, не длинной колонкой
  // ~30+ строк). Mobile остаётся 1 столбец — там grid 2x проигрывает list-view
  // по сканируемости.
  const columns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
  const isGrid = columns > 1;

  // Tap-on-active-tab → scroll to top. Тот же паттерн, что и у ScrollView-веток
  // (scrollViewToTop поддерживает FlatList/FlashList-рефы через scrollToOffset —
  // см. src/lib/tab-scroll-reset.ts).
  const listRef = useRef<FlashListRef<CategoryL1>>(null);
  const [showFab, setShowFab] = useState(false);
  const resetCounter = useTabScrollResetCounter("index");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  const [statusBarCovered, setStatusBarCovered] = useState(false);

  const ready = !isLoading && !error && !!categories;
  const listData = ready ? categories : [];
  // На grid-раскладке контейнер даёт -6px компенсацию (см. CATEGORY_CONTAINER_PADDING) —
  // hero/promo/топ-мастера должны остаться full-bleed, поэтому header и
  // ListEmptyComponent гасят этот отступ обратной отрицательной маргой.
  const gridCancelStyle = isGrid ? { marginHorizontal: -CATEGORY_CONTAINER_PADDING } : undefined;

  return (
    // Закреплённого поля поиска над главной нет: DECISION владельца
    // 2026-09-02 (вечер) — «полоску „что нужно сделать“ полностью убрать».
    // Фото-герой идёт от самого верха экрана.
    <View style={{ flex: 1, backgroundColor: canvasBg }}>
      <FlashList
        style={{ flex: 1, backgroundColor: canvasBg }}
        ref={listRef}
        data={listData}
        keyExtractor={(c) => c.id}
        numColumns={columns}
        extraData={isGrid}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        // Строка состояния: пока виден герой, её защищает собственный тёмный
        // градиент фото; как только герой уходит вверх — включаем непрозрачную
        // полосу, иначе контент наезжает на время и батарею (DECISION владельца
        // 2026-09-03). setState вызывается только на смене состояния, не на
        // каждом кадре: React гасит повтор с тем же значением.
        scrollEventThrottle={32}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          const next = y > HOME_STATUS_BAR_COVER_OFFSET;
          setStatusBarCovered((prev) => (prev === next ? prev : next));
          // Плавающий «+» появляется, когда шапка с полем «Что нужно сделать»
          // ушла вверх (DECISION владельца 2026-09-07).
          setShowFab((prev) => (prev ? y > HOME_FAB_HIDE_OFFSET : y > HOME_FAB_OFFSET));
        }}
        contentContainerStyle={{
          // Фото-hero идёт от самого верха экрана (под статус-бар), поэтому НЕ
          // добавляем paddingTop — CinematicHero сам учитывает inset.
          paddingHorizontal: isGrid ? CATEGORY_CONTAINER_PADDING : 0,
          paddingBottom: tabBarSpace,
        }}
        ListHeaderComponent={
          <View style={gridCancelStyle}>
            <CinematicHero onCreateTask={() => onDescribeTask()} />
            <ActiveOrdersShowcase userId={userId} />
            {/* Promo-баннеры партнёров (рекламные фото-баннеры 16:9). */}
            <PromoBannerCarousel />
            <View className="mt-10 px-5">
              <AppText weight="bold" className="text-display-sm text-ink">
                Категории специалистов
              </AppText>
              <AppText className="mt-1 text-body-md text-mute">
                Выберите раздел — внутри все специалисты по нему
              </AppText>
            </View>
            <View style={{ height: 16 }} />
          </View>
        }
        renderItem={({ item, index }) => (
          <CategoryItem
            category={item}
            isGrid={isGrid}
            isLast={index === listData.length - 1}
            onPress={() => onCategoryPress(item.id)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <CategoriesSkeleton style={gridCancelStyle} />
          ) : error ? (
            <View className="px-5" style={gridCancelStyle}>
              <AppText className="text-body-sm text-error">Не удалось загрузить категории.</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Повторить загрузку категорий"
                onPress={() => void refetch()}
                className="mt-3 min-h-11 self-start items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:bg-canvas-soft"
              >
                <AppText weight="semibold" className="text-body-md text-ink">
                  Повторить
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View className="px-5" style={gridCancelStyle}>
              <AppText className="text-body-sm text-mute">
                Категории услуг ещё не настроены. Свяжитесь с поддержкой.
              </AppText>
            </View>
          )
        }
      />
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

// ----------------------------------------------------------------------------
// Категории — элемент FlashList (ClientHome). Grid-плитка (desktop, numColumns
// > 1) и list-строка (mobile, 1 колонка) — тот же визуал, что был у прежней
// AllCategories, только рендерится per-item вместо .map() внутри ScrollView.
//
// NB: crossfade skeleton → реальные карточки (был в прежней AllCategories,
// Animated.Value 280ms) сюда сознательно не перенесён. FlashList recycle'ит
// ячейки — анимация появления должна жить per-cell (через CellRendererComponent
// или локальный Animated.Value в каждом item'е), а не одним общим opacity на
// весь список, иначе героем/промо/топ-мастерами из ListHeaderComponent тоже
// пришлось бы ждать первую отрисовку категорий. Это лишний вес ради
// декоративного перехода — §1.1 design-quality («убрать лучше, чем
// добавить»). Skeleton/ошибка/пустое состояние — сохранены без изменений.
// ----------------------------------------------------------------------------

interface CategoryItemProps {
  category: CategoryL1;
  isGrid: boolean;
  isLast: boolean;
  onPress: () => void;
}

function CategoryItem({ category, isGrid, isLast, onPress }: CategoryItemProps) {
  const Icon = getCategoryIcon(category.icon);
  const accent = useThemeColor("accent");
  // Один набор иконок на всё приложение — Phosphor, в фирменном цвете (как
  // линейные одноцветные иконки категорий у Thumbtack).
  const iconNode = <Icon size={22} weight="bold" color={accent} />;

  if (isGrid) {
    // Desktop grid: 2 (md) / 3 (lg) колонки, карточки с бордером. Без
    // hairline-разделителей — карточки сами по себе образуют визуальные ячейки.
    // Ширину колонки считает сам FlashList (numColumns) — плитка только даёт
    // gutter через padding.
    return (
      <View
        style={{ paddingHorizontal: CATEGORY_TILE_GUTTER, paddingVertical: CATEGORY_TILE_GUTTER }}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={category.name_ru}
          className="flex-row items-center gap-3 px-4 py-3 rounded-lg border border-hairline bg-canvas active:bg-canvas-soft-2"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft text-ink">
            {iconNode}
          </View>
          <AppText weight="semibold" className="flex-1 text-body-md text-ink" numberOfLines={1}>
            {category.name_ru}
          </AppText>
          <View className="text-mute">
            <CaretRight size={18} weight="bold" color="currentColor" />
          </View>
        </Pressable>
      </View>
    );
  }

  // Mobile: vertical list-view — Vercel-стиль, hairline разделители между
  // строками, иконка-в-круге слева + название + chevron. Lazyweb:
  // Yelp/TaskRabbit/Booksy используют этот паттерн для длинных списков
  // категорий (читается лучше grid'а при N > 12).
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.name_ru}
      className={`flex-row items-center gap-4 px-5 py-3.5 active:bg-canvas-soft-2 ${
        isLast ? "" : "border-b border-hairline"
      }`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-canvas-soft text-ink">
        {iconNode}
      </View>
      <AppText weight="semibold" className="flex-1 text-body-lg text-ink">
        {category.name_ru}
      </AppText>
      <View className="text-mute">
        <CaretRight size={20} weight="bold" color="currentColor" />
      </View>
    </Pressable>
  );
}

/** Skeleton-заглушка категорий на время загрузки — та же форма, что раньше
 *  показывала AllCategories: 10 строк иконка+текст, list-style независимо от
 *  grid/mobile раскладки (её и до FlashList выбирали такой же). */
function CategoriesSkeleton({ style }: { style?: { marginHorizontal: number } }) {
  return (
    <View style={style}>
      {Array.from({ length: 10 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
        <View key={i} className="px-5 py-3 flex-row items-center gap-3">
          <View className="h-10 w-10 rounded-full bg-canvas-soft-2" />
          <View className="h-4 flex-1 max-w-[200px] rounded bg-canvas-soft-2" />
        </View>
      ))}
    </View>
  );
}
