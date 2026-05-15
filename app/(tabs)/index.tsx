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

import { useRouter } from "expo-router";
import { ChevronRight, Droplet, Search, Sparkles, User, Zap } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, FlatList, Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { AppText } from "@/components/AppText";
import { CitySelector, useCityStore, getCityName } from "@/components/CitySelector";
import { Avatar, Button, Card, Skeleton } from "@/components/ui";
import { HelpCallout } from "@/components/HelpCallout";
import { XtrudLogo } from "@/components/XtrudLogo";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { MasterHomeContent } from "@/features/master-view/MasterHomeContent";
import {
  AVAILABILITY_DOT,
  effectiveStatus,
  isAvailabilityVisible,
} from "@/features/master-view/availability";
import { useTopMasters } from "@/features/master-view/use-top-masters";
import { useColorScheme } from "@/hooks/use-color-scheme";
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
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
    >
      <TopBar userId={userId} userName={user?.first_name ?? null} avatarUrl={user?.avatar_url ?? null} />

      {activeRole === "master" && userId ? (
        <View className="mt-6">
          <MasterHomeContent userId={userId} />
        </View>
      ) : (
        <ClientHome
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
// Top-bar — logo + city + auth-кнопка
// ============================================================================

function TopBar({
  userId,
  userName,
  avatarUrl,
}: {
  userId: string | undefined;
  userName: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  return (
    <View className="flex-row items-center justify-between px-5 py-3">
      {/* Логотип: SVG-марка xtrud (от user 2026-05-14) + wordmark «xtrud».
          Иконка слева, размер ~20 (компактно, не перетягивает на себя
          визуальный вес — wordmark и так display-sm). */}
      <Pressable
        onPress={() => router.push("/(tabs)" as never)}
        hitSlop={8}
        className="flex-row items-center gap-1.5"
      >
        <XtrudLogo size={20} />
        <AppText weight="display" className="text-display-sm tracking-tight text-ink">
          xtrud
        </AppText>
      </Pressable>

      <View className="flex-row items-center gap-2">
        <CitySelector />
        {userId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Профиль"
            onPress={() => router.push("/profile" as never)}
            hitSlop={8}
            className="active:opacity-70"
          >
            <Avatar url={avatarUrl} name={userName} seed={userId} size="sm" />
          </Pressable>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<User size={14} strokeWidth={1.75} />}
            onPress={() => router.push("/(auth)/phone" as never)}
          >
            Войти
          </Button>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// Client home — Hero + Featured + Categories + Top masters
// ============================================================================

interface ClientHomeProps {
  onCategoryPress: (id: string) => void;
  onMasterPress: (id: string) => void;
  /** Принимает черновик описания задачи (если пользователь начал писать в hero-input). */
  onDescribeTask: (draft?: string) => void;
}

function ClientHome({ onCategoryPress, onMasterPress, onDescribeTask }: ClientHomeProps) {
  const cityId = useCityStore((s) => s.cityId);
  const cityName = getCityName(cityId);

  return (
    <View>
      <Hero cityName={cityName} />
      <FeaturedRequests onCategoryPress={onCategoryPress} />
      <TopMasters onMasterPress={onMasterPress} />
      <DescribeTaskCallout onPress={() => onDescribeTask()} />
      <AllCategories onCategoryPress={onCategoryPress} />
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
  Icon: typeof Sparkles;
  tintBg: string;
}> = [
  {
    id: "cleaning",
    title: "Уборка квартиры",
    subtitle: "Регулярная и генеральная",
    Icon: Sparkles,
    tintBg: "bg-badge-sky",
  },
  {
    id: "plumbing",
    title: "Сантехник",
    subtitle: "Аварийный и плановый",
    Icon: Droplet,
    tintBg: "bg-badge-violet",
  },
  {
    id: "electrical",
    title: "Электрик",
    subtitle: "Розетки, проводка, свет",
    Icon: Zap,
    tintBg: "bg-badge-amber",
  },
];

function FeaturedRequests({ onCategoryPress }: { onCategoryPress: (id: string) => void }) {
  return (
    <View className="mt-10">
      <View className="px-5">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Часто заказывают
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
                  <Icon size={28} strokeWidth={1.5} color="currentColor" />
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
// DescribeTaskCallout — секция «Опишите задачу». Vercel-card с AI-style hero
// сверху (tinted фон + декоративные круги, как в FeaturedRequests). Текст
// продаёт privacy-фичу: «мастера не видят твой номер». Альтернативный путь
// к мастерам: «не знаю кого искать → опишите → получите отклики».
// ----------------------------------------------------------------------------

function DescribeTaskCallout({ onPress }: { onPress: () => void }) {
  return (
    <View className="mt-10 mx-5 rounded-xl border border-hairline bg-canvas-soft overflow-hidden">
      {/* AI-фон в стиле Vercel docs covers: violet tint + декоративные круги */}
      <View className="h-24 bg-badge-violet relative overflow-hidden">
        <View
          className="absolute rounded-full bg-canvas"
          style={{ top: -30, left: -20, width: 90, height: 90, opacity: 0.3 }}
        />
        <View
          className="absolute rounded-full bg-canvas"
          style={{ bottom: -20, right: 30, width: 70, height: 70, opacity: 0.4 }}
        />
        <View
          className="absolute rounded-md bg-canvas"
          style={{ top: 14, right: 24, width: 22, height: 22, opacity: 0.55, transform: [{ rotate: "18deg" }] }}
        />
        <View
          className="absolute rounded-full bg-canvas"
          style={{ top: 38, right: 90, width: 14, height: 14, opacity: 0.5 }}
        />
      </View>
      {/* Body */}
      <View className="p-5">
        <AppText weight="semibold" className="text-title-lg tracking-tight text-ink">
          Опишите задачу — узнаете цены
        </AppText>
        <AppText className="mt-2 text-body-md text-body">
          Мастера ответят, за сколько готовы взяться. Ваш номер скрыт 📵
        </AppText>
        <View className="mt-4 self-start">
          <Button onPress={onPress} size="md" variant="primary">
            Создать заказ
          </Button>
        </View>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Hero — заголовок + inline task input + CTA + trust-чипы
// ----------------------------------------------------------------------------

function Hero({
  cityName,
}: {
  cityName: string;
}) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // Город не используется в заголовке, но оставляем для будущего «… в Магасе».
  void cityName;

  // Theme-aware подсветка SearchBar.
  // - light: soft tinted shadow + hairline border (приподнимает над фоном)
  // - dark: чёрная тень исчезает на чёрном canvas → переключаем на белое
  //   мягкое свечение (glow) + видимый бордер из hairline-strong, чтобы
  //   primary action оставался выраженным анкором (фидбэк user 2026-05-14
  //   «в тёмной теме поиск незаметный»).
  // На dark — приглушённая белая обводка + мягкое свечение. Кольцо 1px и два
  // glow-слоя (близкий + дальний эфирный) очень слабые, drop-shadow тоже
  // аккуратный (фидбэк user 2026-05-15: «тень была жирная, заметная»).
  // На light — лёгкий drop-shadow.
  const searchShadow = isDark
    ? // 2026-05-15 user: «сделай тень слабее, чтобы меньше чёрного». Чёрный
      // drop-layer 0.25 → 0.10 (более чем в 2 раза), белый glow остаётся —
      // он и есть основной визуальный приём.
      "0 0 0 1px rgba(255,255,255,0.1), 0 0 18px rgba(255,255,255,0.06), 0 0 40px rgba(255,255,255,0.03), 0 2px 10px rgba(0,0,0,0.1)"
    : // 2026-05-15 user: «в светлой тень тёмная, сделай в 2 раза слабее».
      // Делим opacity пополам: 0.06→0.03, 0.03→0.015.
      "0 2px 10px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.015)";

  return (
    <View className="px-5 mt-10">
      <AppText weight="display" className="text-display-lg tracking-tight text-ink">
        Найдутся мастера
      </AppText>

      {/* PRIMARY: большой SearchBar — главное действие. По паттерну TaskRabbit
          search-first: один visual-anchor сверху, никаких отвлекающих
          элементов вокруг (H1 + search достаточно).
          Theme-aware визуал:
            - light: hairline-border + мягкий drop-shadow
            - dark:  белая обводка (border-ink) + яркое white glow,
                     иконка и placeholder тоже белые (text-ink) — как primary action.
          Border-классы для разных тем — чтобы CSS-var корректно резолвилась в
          обоих portal'ах (light → border-hairline, dark → border-ink). */}
      <View className="mt-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Поиск мастеров"
          onPress={() => router.push("/search" as never)}
          className={`flex-row items-center gap-3 h-14 rounded-xl bg-canvas border px-5 active:opacity-70 ${
            isDark ? "border-ink/30" : "border-hairline"
          }`}
          style={{ boxShadow: searchShadow }}
        >
          <Search
            size={20}
            strokeWidth={1.75}
            color="currentColor"
            className={isDark ? "text-ink" : "text-mute"}
          />
          <AppText
            className={`flex-1 text-body-md ${isDark ? "text-ink" : "text-mute"}`}
          >
            Специалист или услуга…
          </AppText>
        </Pressable>
      </View>

    </View>
  );
}

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
                    <Image source={{ uri: colorUrl }} style={{ width: 24, height: 24 }} />
                  ) : (
                    <Icon size={20} strokeWidth={1.5} color="currentColor" />
                  )}
                </View>
                <AppText weight="semibold" className="flex-1 text-body-md text-ink">
                  {cat.name_ru}
                </AppText>
                <View className="text-mute">
                  <ChevronRight size={20} strokeWidth={1.5} color="currentColor" />
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}
