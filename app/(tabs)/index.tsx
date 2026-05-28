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
 *   - Тап "Описать задачу" → /(tabs)/orders/new (на финальной отправке login wall)
 *   - Тап карточки мастера → /(tabs)/master/[id]
 *   - Тап категории → /(tabs)/category/[id]
 *
 * Master-режим (если active_role === "master") — отдельный экран MasterHomeContent.
 */

import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { CaretRight, Drop, Sparkle, Lightning } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { Animated, FlatList, Pressable, ScrollView, View } from "react-native";
import { useAppWidth } from "@/lib/use-app-width";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { AppText } from "@/components/AppText";
import { Avatar, Card, Skeleton } from "@/components/ui";
import { HelpCallout } from "@/components/HelpCallout";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { DescribeTaskCallout } from "@/features/home/DescribeTaskCallout";
import { CinematicHero } from "@/features/home/CinematicHero";
import { QuickServices } from "@/features/home/QuickServices";
import { PromoBannerCarousel } from "@/features/home/PromoBannerCarousel";
// HowItWorks скрыт 2026-05-18 — компонент остался в src/features/home/.
// import { HowItWorks } from "@/features/home/HowItWorks";
import { MasterCinematicHero } from "@/features/master-view/MasterCinematicHero";
import { MasterHomeContent } from "@/features/master-view/MasterHomeContent";
import {
  AVAILABILITY_DOT,
  effectiveStatus,
  isAvailabilityVisible,
} from "@/features/master-view/availability";
import { useRecordMasterView } from "@/features/master-view/use-record-view";
import { useTopMasters } from "@/features/master-view/use-top-masters";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);

  const activeRole = user?.active_role ?? "client";
  const refresh = usePullToRefresh();

  // Tap-on-active-tab → scroll to top (стандартный mobile-pattern).
  // TabBar trigger'ит счётчик при тапе на focused-таб «Главная».
  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("index");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(scrollRef);
  }, [resetCounter]);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        // Обе роли: фото-hero идёт от самого верха экрана (под статус-бар),
        // поэтому НЕ добавляем paddingTop — CinematicHero (клиент) и
        // MasterCinematicHero (мастер) сами учитывают inset.
        paddingTop: 0,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
    >
      {activeRole === "master" && userId ? (
        // Мастер: фото-герой (логотип + лимит откликов + город + приветствие +
        // статистика поверх фото) от самого верха, затем контент на canvas.
        <View>
          <MasterCinematicHero userId={userId} />
          <View className="mt-3">
            <MasterHomeContent userId={userId} />
          </View>
        </View>
      ) : (
        <ClientHome
          scrollRef={scrollRef}
          onCategoryPress={(id) => router.push(`/category/${id}` as never)}
          onMasterPress={(id) => router.push(`/master/${id}` as never)}
          onDescribeTask={(draft) => {
            // Передаём текст черновика в визард — orders/new подхватит его как
            // начальное значение поля description.
            const url = draft
              ? `/orders/new?draft=${encodeURIComponent(draft)}`
              : "/orders/new";
            router.push(url as never);
          }}
        />
      )}
    </ScrollView>
  );
}

// ============================================================================
// Client home — Hero + Featured + Categories + Top masters
//
// NB: TopBar (логотип + город + лимит откликов на canvas) удалён 2026-05-24.
// Раньше рендерился только для мастера; теперь его роль выполняет фото-герой
// MasterCinematicHero (логотип/лимит/город лежат поверх фото). У клиента
// шапка давно живёт внутри CinematicHero.
// ============================================================================

interface ClientHomeProps {
  /** Ref внешнего ScrollView — для скролла к блоку «Все категории». */
  scrollRef: React.RefObject<ScrollView | null>;
  onCategoryPress: (id: string) => void;
  onMasterPress: (id: string) => void;
  /** Принимает черновик описания задачи (если пользователь начал писать в hero-input). */
  onDescribeTask: (draft?: string) => void;
}

function ClientHome({ scrollRef, onCategoryPress, onMasterPress, onDescribeTask }: ClientHomeProps) {
  // Y-позиция блока AllCategories — для кнопки «Все категории» в QuickServices
  // (плавный скролл вниз к полному списку). Запоминается через onLayout.
  const allCategoriesY = useRef(0);
  const scrollToAllCategories = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, allCategoriesY.current - 12), animated: true });
  };

  return (
    <View>
      {/* Cinematic full-bleed фото-hero (Farce-style, 2026-05-21). */}
      <CinematicHero />
      {/* Категории — 4 круга (Уборка/Сантехника/Доставка воды/Все категории).
          Возвращены под hero по фидбэку юзера 2026-05-21. */}
      <QuickServices onShowAll={scrollToAllCategories} />
      {/* Блок «Часто ищут» (FeaturedRequests) скрыт по фидбэку юзера 2026-05-21.
          Компонент сохранён ниже — вернуть можно раскомментировав строку:
          <FeaturedRequests onCategoryPress={onCategoryPress} /> */}
      {/* Promo-баннеры партнёров (рекламные фото-баннеры 16:9). */}
      <PromoBannerCarousel />
      {/* Второй кинематографичный фото-hero «Создайте заказ» (edge-to-edge).
          Divider убран 2026-05-21: у фото-блока своя визуальная граница
          (скруглённые углы + тёмное фото на canvas), hairline-линия с боковыми
          отступами прямо перед full-bleed баннером смотрелась обрезанной. */}
      <DescribeTaskCallout onPress={() => onDescribeTask()} />
      <TopMasters onMasterPress={onMasterPress} />
      <View
        onLayout={(e) => {
          allCategoriesY.current = e.nativeEvent.layout.y;
        }}
      >
        <AllCategories onCategoryPress={onCategoryPress} />
      </View>
      {/* HowItWorks скрыт по фидбэку user 2026-05-18 («не нужен»).
          Компонент остался в `src/features/home/HowItWorks.tsx` если
          вернёшь — можно раскомментировать.
          <HowItWorks /> */}
      {/* Help-плашка под полным списком категорий — «не нашли мастера?» */}
      <View className="mt-8 mx-5">
        <HelpCallout
          title="Не нашли нужного мастера?"
          body="Сообщите нам, мы поищем подходящих мастеров по республике, бесплатно"
          onPress={() => onDescribeTask()}
        />
      </View>
    </View>
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
              <View className={`h-28 ${item.tintBg} items-center justify-center relative overflow-hidden`}>
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
                  style={{ top: 18, right: 18, width: 18, height: 18, opacity: 0.55, transform: [{ rotate: "12deg" }] }}
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
      .map((m) => m.user.avatar_url)
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
          Лучшие мастера рядом
        </AppText>
        <AppText className="mt-1 text-body-sm text-mute">По рейтингу и отзывам</AppText>
      </View>

      {isLoading ? (
        // Skeleton-карусель: 4 заглушки повторяющие реальный MasterMiniCard
        // (180×180 avatar-area + 3 строки текста), чтобы пользователь сразу
        // видел секцию и понимал что здесь будет.
        <View
          className="flex-row gap-3"
          style={{ paddingHorizontal: 20, paddingTop: 12 }}
        >
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
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Мастер";
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
// All categories — сетка
// ----------------------------------------------------------------------------

function AllCategories({ onCategoryPress }: { onCategoryPress: (id: string) => void }) {
  const { data: categories, isLoading, error } = useVisibleCategories();
  const width = useAppWidth();
  // На desktop колонок 2-3 (Lazyweb-паттерн: afterpay/people/zara — категории
  // в marketplace на широком вьюпорте подаются grid'ом, не длинной колонкой
  // ~30+ строк). Mobile остаётся 1 столбец — там grid 2x проигрывает list-view
  // по сканируемости.
  const columns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
  const isGrid = columns > 1;

  // Fade-in реального списка при появлении (skeleton → categories), чтобы
  // переход не был резким. См. ту же логику в TopMasters.
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading && categories && categories.length > 0) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, categories, opacity]);

  return (
    <View className="mt-10">
      <View className="px-5">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Все мастера
        </AppText>
      </View>

      {/* Vertical list-view 32 категории — Vercel-стиль: монохром, hairline
          разделители между строками, иконка-в-круге слева + название + chevron.
          Lazyweb: Yelp/TaskRabbit/Booksy используют этот паттерн для длинных
          списков категорий (читается лучше grid'а при N > 12). */}
      {isLoading ? (
        <View className="mt-4">
          {Array.from({ length: 10 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
            <View key={i} className="px-5 py-3 flex-row items-center gap-3">
              <View className="h-10 w-10 rounded-full bg-canvas-soft-2" />
              <View className="h-4 flex-1 max-w-[200px] rounded bg-canvas-soft-2" />
            </View>
          ))}
        </View>
      ) : error ? (
        <View className="mt-4 px-5">
          <AppText className="text-body-sm text-error">
            Не удалось загрузить категории.
          </AppText>
        </View>
      ) : !categories || categories.length === 0 ? (
        <View className="mt-4 px-5">
          <AppText className="text-body-sm text-mute">
            Категории ещё не настроены. Свяжитесь с поддержкой.
          </AppText>
        </View>
      ) : isGrid ? (
        // Desktop grid: 2 (md) / 3 (lg) колонки, карточки с бордером,
        // gap-y/gap-x через padding половинок. Без hairline-разделителей —
        // карточки сами по себе образуют визуальные ячейки.
        // NB: flexDirection/flexWrap через style — на Animated.View
        // NativeWind-классы flex-row/flex-wrap иногда не докатывают через
        // RN-Web (фактический display:flex остаётся column).
        <Animated.View
          className="mt-4 px-5"
          style={{
            opacity,
            flexDirection: "row",
            flexWrap: "wrap",
            marginHorizontal: -6,
          }}
        >
          {categories.map((cat) => {
            const Icon = getCategoryIcon(cat.icon);
            const colorUrl = getCategoryColorIconUrl(cat.id);
            return (
              <View
                key={cat.id}
                style={{ width: `${100 / columns}%`, paddingHorizontal: 6, paddingVertical: 6 }}
              >
                <Pressable
                  onPress={() => onCategoryPress(cat.id)}
                  accessibilityRole="button"
                  accessibilityLabel={cat.name_ru}
                  className="flex-row items-center gap-3 px-4 py-3 rounded-lg border border-hairline bg-canvas active:bg-canvas-soft-2"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft text-ink">
                    {colorUrl ? (
                      <ExpoImage source={{ uri: colorUrl }} style={{ width: 24, height: 24 }} contentFit="contain" cachePolicy="memory-disk" />
                    ) : (
                      <Icon size={20} weight="bold" color="currentColor" />
                    )}
                  </View>
                  <AppText weight="semibold" className="flex-1 text-body-md text-ink" numberOfLines={1}>
                    {cat.name_ru}
                  </AppText>
                  <View className="text-mute">
                    <CaretRight size={18} weight="bold" color="currentColor" />
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Animated.View>
      ) : (
        <Animated.View className="mt-4" style={{ opacity }}>
          {categories.map((cat, idx) => {
            const Icon = getCategoryIcon(cat.icon);
            // Mapping по L2 id — гарантирует уникальную иконку каждой категории.
            const colorUrl = getCategoryColorIconUrl(cat.id);
            const isLast = idx === categories.length - 1;
            return (
              <Pressable
                key={cat.id}
                onPress={() => onCategoryPress(cat.id)}
                accessibilityRole="button"
                accessibilityLabel={cat.name_ru}
                className={`flex-row items-center gap-3 px-5 py-3 active:bg-canvas-soft-2 ${
                  isLast ? "" : "border-b border-hairline"
                }`}
              >
                {/* Если есть fluent-color match — рендерим цветную SVG-иконку через CDN.
                    Иначе — Lucide моно (fallback). NB: эмодзи запрещены (см. CLAUDE.md). */}
                <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft text-ink">
                  {colorUrl ? (
                    <ExpoImage source={{ uri: colorUrl }} style={{ width: 24, height: 24 }} contentFit="contain" cachePolicy="memory-disk" />
                  ) : (
                    <Icon size={20} weight="bold" color="currentColor" />
                  )}
                </View>
                <AppText weight="semibold" className="flex-1 text-body-md text-ink">
                  {cat.name_ru}
                </AppText>
                <View className="text-mute">
                  <CaretRight size={20} weight="bold" color="currentColor" />
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}
