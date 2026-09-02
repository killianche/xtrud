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
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { CaretRight, Drop, Lightning, Sparkle } from "phosphor-react-native";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { Animated, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, Card, Skeleton } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import {
  useVisibleCategories,
  type VisibleCategory,
} from "@/features/categories/use-visible-categories";
import { ActiveOrdersShowcase } from "@/features/home/ActiveOrdersShowcase";
import { CinematicHero } from "@/features/home/CinematicHero";
import { PromoBannerCarousel } from "@/features/home/PromoBannerCarousel";
import {
  AVAILABILITY_DOT,
  effectiveStatus,
  isAvailabilityVisible,
} from "@/features/master-view/availability";
import { useRecordMasterView } from "@/features/master-view/use-record-view";
import { useTopMasters } from "@/features/master-view/use-top-masters";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColor } from "@/lib/use-theme-color";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);

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
      insets={insets}
      refresh={refresh}
      onCategoryPress={(id) => router.push(`/category/${id}` as never)}
      onMasterPress={(id) => router.push(`/master/${id}` as never)}
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
  insets: ReturnType<typeof useSafeAreaInsets>;
  refresh: ReturnType<typeof usePullToRefresh>;
  onCategoryPress: (id: string) => void;
  onMasterPress: (id: string) => void;
  /** Принимает черновик описания задачи (если пользователь начал писать в hero-input). */
  onDescribeTask: (draft?: string) => void;
}

// Раскладка сетки категорий на широком экране — 2/3 колонки (см. прежнюю
// AllCategories). Плитка тянет свой gutter через paddingHorizontal — контейнер
// компенсирует внешние 20px через CONTAINER_HORIZONTAL_PADDING.
const CATEGORY_TILE_GUTTER = 6;
const CATEGORY_SCREEN_PADDING = 20;
const CATEGORY_CONTAINER_PADDING = CATEGORY_SCREEN_PADDING - CATEGORY_TILE_GUTTER;

function ClientHome({
  userId,
  insets,
  refresh,
  onCategoryPress,
  onMasterPress,
  onDescribeTask,
}: ClientHomeProps) {
  const { data: categories, isLoading, error } = useVisibleCategories();
  const width = useAppWidth();
  const canvasBg = useThemeColor("canvas");
  // На desktop колонок 2-3 (Lazyweb-паттерн: afterpay/people/zara — категории
  // в marketplace на широком вьюпорте подаются grid'ом, не длинной колонкой
  // ~30+ строк). Mobile остаётся 1 столбец — там grid 2x проигрывает list-view
  // по сканируемости.
  const columns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
  const isGrid = columns > 1;

  // Tap-on-active-tab → scroll to top. Тот же паттерн, что и у ScrollView-веток
  // (scrollViewToTop поддерживает FlatList/FlashList-рефы через scrollToOffset —
  // см. src/lib/tab-scroll-reset.ts).
  const listRef = useRef<FlashListRef<VisibleCategory>>(null);
  const resetCounter = useTabScrollResetCounter("index");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  const ready = !isLoading && !error && !!categories;
  const listData = ready ? categories : [];
  // На grid-раскладке контейнер даёт -6px компенсацию (см. CATEGORY_CONTAINER_PADDING) —
  // hero/promo/топ-мастера должны остаться full-bleed, поэтому header и
  // ListEmptyComponent гасят этот отступ обратной отрицательной маргой.
  const gridCancelStyle = isGrid ? { marginHorizontal: -CATEGORY_CONTAINER_PADDING } : undefined;

  return (
    <FlashList
      style={{ flex: 1, backgroundColor: canvasBg }}
      ref={listRef}
      data={listData}
      keyExtractor={(c) => c.id}
      numColumns={columns}
      extraData={isGrid}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
      contentContainerStyle={{
        // Фото-hero идёт от самого верха экрана (под статус-бар), поэтому НЕ
        // добавляем paddingTop — CinematicHero сам учитывает inset.
        paddingHorizontal: isGrid ? CATEGORY_CONTAINER_PADDING : 0,
        paddingBottom: insets.bottom + 24,
      }}
      ListHeaderComponent={
        <View style={gridCancelStyle}>
          <CinematicHero onCreateTask={() => onDescribeTask()} />
          <ActiveOrdersShowcase userId={userId} />
          {/* Блок «Часто ищут» (FeaturedRequests) скрыт по фидбэку юзера 2026-05-21.
              Компонент сохранён ниже — вернуть можно раскомментировав строку:
              <FeaturedRequests onCategoryPress={onCategoryPress} /> */}
          {/* Promo-баннеры партнёров (рекламные фото-баннеры 16:9). */}
          <PromoBannerCarousel />
          <TopMasters onMasterPress={onMasterPress} />
          <View className="mt-10 px-5">
            <AppText weight="semibold" className="text-title-lg text-ink">
              Категории исполнителей
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
  );
}

// ----------------------------------------------------------------------------
// FeaturedRequests — «Часто заказывают». 3 hardcoded универсальных категории.
// Hero-area стиля Vercel docs covers: soft-tinted фон + 2-3 декоративные
// гео-фигуры (круги с разной opacity) + крупная центральная иконка в canvas-
// circle. Под hero — title + subtitle. Каждая категория — свой tint-цвет
// из палитры badge-*. Цель: визуально декоративный, но строго моно-Vercel,
// без стоковых фото и излишеств.
// ----------------------------------------------------------------------------

const FEATURED: Array<{
  id: string;
  title: string;
  subtitle: string;
  Icon: typeof Sparkle;
  tintBg: string;
}> = [
  {
    id: "cleaning",
    title: "Уборка квартиры",
    subtitle: "Регулярная и генеральная",
    Icon: Sparkle,
    tintBg: "bg-badge-sky",
  },
  {
    id: "plumbing",
    title: "Сантехник",
    subtitle: "Аварийный и плановый",
    Icon: Drop,
    tintBg: "bg-badge-violet",
  },
  {
    id: "electrical",
    title: "Электрик",
    subtitle: "Розетки, проводка, свет",
    Icon: Lightning,
    tintBg: "bg-badge-amber",
  },
];

// biome-ignore lint/correctness/noUnusedVariables: curated-search block is retained for the upcoming home functionality redesign
function FeaturedRequests({ onCategoryPress }: { onCategoryPress: (id: string) => void }) {
  return (
    <View className="mt-10">
      <View className="px-5">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Часто ищут
        </AppText>
      </View>

      <FlatList
        data={FEATURED}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingTop: 12 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const Icon = item.Icon;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.title}
              onPress={() => onCategoryPress(item.id)}
              className="overflow-hidden rounded-xl border border-hairline bg-canvas-soft active:opacity-80"
              style={{ width: 220 }}
            >
              {/* Hero-illustration: tinted фон + декоративные фигуры + центр-иконка */}
              <View
                className={`h-28 ${item.tintBg} items-center justify-center relative overflow-hidden`}
              >
                {/* Декоры — белые/canvas круги с разной прозрачностью, имитация Vercel docs covers */}
                <View
                  className="absolute rounded-full bg-canvas"
                  style={{ top: -18, left: -16, width: 64, height: 64, opacity: 0.35 }}
                />
                <View
                  className="absolute rounded-full bg-canvas"
                  style={{ bottom: -14, right: -10, width: 52, height: 52, opacity: 0.45 }}
                />
                <View
                  className="absolute rounded-md bg-canvas"
                  style={{
                    top: 18,
                    right: 18,
                    width: 18,
                    height: 18,
                    opacity: 0.55,
                    transform: [{ rotate: "12deg" }],
                  }}
                />
                {/* Центральная иконка */}
                <View className="h-14 w-14 items-center justify-center rounded-full bg-canvas text-ink">
                  <Icon size={28} weight="bold" color="currentColor" />
                </View>
              </View>
              {/* Body */}
              <View className="p-4">
                <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText className="mt-1 text-caption text-mute" numberOfLines={1}>
                  {item.subtitle}
                </AppText>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

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
// Top masters — горизонтальная карусель, рендерится только если ≥ 3 карточки
// ----------------------------------------------------------------------------

function TopMasters({ onMasterPress }: { onMasterPress: (id: string) => void }) {
  const { data: masters, isLoading } = useTopMasters(7);

  // Fade-in данных при появлении (skeleton → real cards) — переход плавный,
  // 280ms, без stagger внутри (естественный stagger между секциями возникает
  // из-за разного времени fetch'а каждой). Решает фидбэк user 2026-05-14
  // «блок резко появляется», когда useTopMasters заканчивает запрос.
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading && masters && masters.length >= 3) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, masters, opacity]);

  // Prefetch первых 4-6 аватаров — это критичные above-the-fold картинки
  // в карусели Top Masters. Native: expo-image.prefetch ставит их в memory-
  // кэш ДО viewport visibility, ощущается «мгновенно» при свайпе. На web
  // это безопасный nop (expo-image на web игнорирует prefetch). Defer'им
  // через useEffect, чтобы не блокировать первый paint.
  useEffect(() => {
    if (!masters || masters.length === 0) return;
    const urls = masters
      .slice(0, 6)
      .map((m) => m.user?.avatar_url)
      .filter((u): u is string => !!u);
    if (urls.length > 0) {
      // expo-image.prefetch принимает массив URLs; sync API на web,
      // async на native. Без await — fire-and-forget.
      ExpoImage.prefetch(urls);
    }
  }, [masters]);

  // Не показываем секцию если данных нет или их слишком мало (по правилу
  // "пустую витрину не показываем" из аудита).
  if (!isLoading && (!masters || masters.length < 3)) return null;

  return (
    <View className="mt-10">
      <View className="px-5">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Исполнители рядом
        </AppText>
        <AppText className="mt-1 text-body-sm text-mute">По рейтингу и отзывам</AppText>
      </View>

      {isLoading ? (
        // Skeleton-карусель: 4 заглушки повторяющие реальный MasterMiniCard
        // (180×180 avatar-area + 3 строки текста), чтобы пользователь сразу
        // видел секцию и понимал что здесь будет.
        <View className="flex-row gap-3" style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 180 }}>
              <Skeleton width={180} height={180} className="rounded-lg" />
              <Skeleton height={16} width={140} className="mt-3 rounded" />
              <Skeleton height={12} width={110} className="mt-2 rounded" />
              <Skeleton height={12} width={70} className="mt-2 rounded" />
            </View>
          ))}
        </View>
      ) : (
        <Animated.View style={{ opacity }}>
          <FlatList
            data={masters ?? []}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingTop: 12 }}
            keyExtractor={(m) => m.user.id}
            renderItem={({ item }) => (
              <MasterMiniCard
                id={item.user.id}
                avatarUrl={item.user.avatar_url}
                firstName={item.user.first_name}
                lastName={item.user.last_name}
                rating={item.profile.rating_overall_avg}
                ratingCount={item.profile.rating_overall_count}
                cityName={item.city?.name ?? null}
                categories={item.categories}
                availabilityStatus={effectiveStatus(
                  item.profile.availability_status,
                  item.profile.availability_until,
                )}
                onPress={() => onMasterPress(item.user.id)}
              />
            )}
          />
        </Animated.View>
      )}
    </View>
  );
}

interface MasterMiniCardProps {
  id: string;
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  rating: number | null;
  ratingCount: number | null;
  cityName: string | null;
  categories: string[];
  availabilityStatus: ReturnType<typeof effectiveStatus>;
  onPress: () => void;
}

function MasterMiniCard({
  id,
  avatarUrl,
  firstName,
  lastName,
  rating,
  ratingCount,
  cityName,
  categories,
  availabilityStatus,
  onPress,
}: MasterMiniCardProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Исполнитель";
  // 1-2 категории через · разделитель — больше не помещается в w-180
  const categoriesText = categories.slice(0, 2).join(" · ");

  // Telemetry: impression при появлении карточки в Top Masters карусели.
  // Server-side dedup в RPC (24h по session_id) защищает от накрутки.
  const recordView = useRecordMasterView();
  useEffect(() => {
    if (id) recordView(id, "impression");
  }, [id, recordView]);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={fullName}>
      <Card variant="default" padding="none" style={{ width: 180 }}>
        <View
          style={{
            width: 180,
            height: 180,
            backgroundColor: "transparent",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <Avatar url={avatarUrl} name={fullName} seed={fullName} size="xl" />
          {/* Availability dot — «онлайн»-индикатор в правом-нижнем углу аватара. */}
          {isAvailabilityVisible(availabilityStatus) ? (
            <View
              style={{
                position: "absolute",
                bottom: 36,
                right: 36,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: AVAILABILITY_DOT[availabilityStatus],
                borderWidth: 2,
                borderColor: "#ffffff",
              }}
            />
          ) : null}
        </View>
        <View className="px-3 pb-3">
          <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
            {fullName}
          </AppText>
          {/* Категории — главный сигнал «чем занимается»: ставим выше рейтинга */}
          {categoriesText ? (
            <AppText className="mt-1 text-caption text-ink" numberOfLines={1}>
              {categoriesText}
            </AppText>
          ) : null}
          {rating !== null && ratingCount !== null && ratingCount > 0 ? (
            <View className="mt-1 flex-row items-center gap-1">
              <AppText weight="mono" className="text-mono-caption text-ink">
                ★ {rating.toFixed(1)}
              </AppText>
              <AppText weight="mono" className="text-mono-caption text-mute">
                ({ratingCount})
              </AppText>
            </View>
          ) : null}
          {cityName ? (
            <AppText className="mt-1 text-caption text-mute" numberOfLines={1}>
              {cityName}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

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
  category: VisibleCategory;
  isGrid: boolean;
  isLast: boolean;
  onPress: () => void;
}

function CategoryItem({ category, isGrid, isLast, onPress }: CategoryItemProps) {
  const Icon = getCategoryIcon(category.icon);
  // Mapping по L2 id — гарантирует уникальную иконку каждой категории.
  const colorUrl = getCategoryColorIconUrl(category.id);
  // Если есть fluent-color match — рендерим цветную SVG-иконку через CDN.
  // Иначе — Phosphor моно (fallback). NB: эмодзи запрещены (см. CLAUDE.md).
  const iconNode = colorUrl ? (
    <ExpoImage
      source={{ uri: colorUrl }}
      style={{ width: 24, height: 24 }}
      contentFit="contain"
      cachePolicy="memory-disk"
    />
  ) : (
    <Icon size={20} weight="bold" color="currentColor" />
  );

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
      className={`flex-row items-center gap-3 px-5 py-3 active:bg-canvas-soft-2 ${
        isLast ? "" : "border-b border-hairline"
      }`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft text-ink">
        {iconNode}
      </View>
      <AppText weight="semibold" className="flex-1 text-body-md text-ink">
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
