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
import {
  Armchair,
  DoorOpen,
  Droplet,
  Flame,
  HardHat,
  type LucideIcon,
  Paintbrush,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  User,
  Wind,
  Wrench,
  Zap,
} from "lucide-react-native";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Маппинг имён иконок из БД (categories_l2.icon) → Lucide-компоненты.
// Используется в плитках категорий на главной.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  HardHat,
  Paintbrush,
  Zap,
  Droplet,
  DoorOpen,
  Square,
  Flame,
  Wind,
  Armchair,
  Wrench,
  Sparkles,
};
import { AppText } from "@/components/AppText";
import { CitySelector, useCityStore, getCityName } from "@/components/CitySelector";
import { Avatar, Button, Card } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useFeaturedCategories } from "@/features/categories/use-featured-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { MasterHomeContent } from "@/features/master-view/MasterHomeContent";
import { useTopMasters } from "@/features/master-view/use-top-masters";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);

  const activeRole = user?.active_role ?? "client";
  const refresh = usePullToRefresh();

  return (
    <ScrollView
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
      {/* Логотип */}
      <Pressable onPress={() => router.push("/(tabs)" as never)} hitSlop={8}>
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
  const router = useRouter();

  return (
    <View>
      {/* PASSIVE PATH — «опишите задачу, мастера откликнутся» */}
      <Hero cityName={cityName} onDescribeTask={onDescribeTask} />

      {/* Визуальный разделитель: тонкая линия + заголовок второго пути */}
      <BrowseDivider />

      {/* ACTIVE PATH — «найдите мастера сами» через поиск + фильтры + категории */}
      <BrowseSearchAndFilters
        onSearchPress={() => router.push("/search" as never)}
      />
      <FeaturedVerticals onPress={onCategoryPress} />
      <TopMasters onMasterPress={onMasterPress} />
      <AllCategories onCategoryPress={onCategoryPress} />
    </View>
  );
}

// ----------------------------------------------------------------------------
// BrowseDivider — визуальное разделение двух entry points главной.
// ----------------------------------------------------------------------------

function BrowseDivider() {
  return (
    <View className="mt-10 px-5">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 h-px bg-hairline" />
        <AppText weight="medium" className="text-mute text-body-sm uppercase tracking-wider">
          или
        </AppText>
        <View className="flex-1 h-px bg-hairline" />
      </View>
      <View className="mt-6">
        <AppText weight="display" className="text-display-md tracking-tight text-ink">
          Найдите мастера сами
        </AppText>
        <AppText className="mt-2 text-body-md text-body">
          Поиск по имени, категории или сразу выбирайте из списка ниже.
        </AppText>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// BrowseSearchAndFilters — search bar для мастеров + горизонтальные фильтры.
//
// MVP: SearchBar — кнопка-плейсхолдер, тап → переход на /search экран
// (будет реализован отдельной задачей). Filter chips — UI-only stubs
// показывают плановые фильтры (Категория / Город / Рейтинг / Опыт).
// При нажатии на любой — пока no-op, потом подключим BottomSheet с выбором.
// ----------------------------------------------------------------------------

function BrowseSearchAndFilters({ onSearchPress }: { onSearchPress: () => void }) {
  return (
    <View className="mt-6">
      {/* Search-кнопка-плейсхолдер (как кликабельный input) */}
      <View className="px-5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Поиск мастеров"
          onPress={onSearchPress}
          className="flex-row items-center gap-2 h-12 rounded-md border border-hairline bg-canvas px-4 active:opacity-70"
        >
          <Search size={18} strokeWidth={1.75} color="currentColor" className="text-mute" />
          <AppText className="text-body-md text-mute">
            Имя или категория мастера
          </AppText>
        </Pressable>
      </View>

      {/* Filter chips — горизонтальный scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 12 }}
      >
        <FilterChip label="Категория" />
        <FilterChip label="Город" />
        <FilterChip label="★ 4+" />
        <FilterChip label="Опыт от 3 лет" />
        <FilterChip label="С инструментом" />
      </ScrollView>
    </View>
  );
}

function FilterChip({ label }: { label: string }) {
  // Stub: пока no-op. В следующей итерации подключим BottomSheet выбора.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Фильтр: ${label}`}
      onPress={() => {}}
      className="flex-row items-center gap-1.5 h-8 px-3 rounded-full bg-canvas border border-hairline active:opacity-70"
    >
      <AppText weight="medium" className="text-body-sm text-ink">
        {label}
      </AppText>
      <SlidersHorizontal size={12} strokeWidth={1.75} color="currentColor" className="text-mute" />
    </Pressable>
  );
}

// ----------------------------------------------------------------------------
// Hero — заголовок + inline task input + CTA + trust-чипы
// ----------------------------------------------------------------------------

function Hero({
  cityName,
  onDescribeTask,
}: {
  cityName: string;
  onDescribeTask: (draft?: string) => void;
}) {
  return (
    <View className="px-5 mt-8">
      <AppText weight="display" className="text-display-lg tracking-tight text-ink">
        Мастера для ремонта в {cityName === "Магас" ? "Ингушетии" : cityName}
      </AppText>

      {/* Subtitle — одна короткая фраза. По паттерну Wander / Yelp / Booksy
          из Lazyweb: один tagline без выделения, без второго предложения. */}
      <AppText className="mt-3 text-body-md text-body leading-6">
        Опишите задачу — мастера ответят с ценами, не зная вашего номера.
      </AppText>

      {/* CTA — единственное действие в hero. */}
      <View className="mt-6">
        <Button size="lg" fullWidth onPress={() => onDescribeTask()}>
          Написать свою задачу
        </Button>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Featured verticals — categories_l2 с is_featured=true.
// На MVP в базе помечены: cleaning (Клининг) + plumbing (Сантехника).
// Подаются 2-мя крупными plate-карточками в hero-зоне над обычной сеткой.
// ----------------------------------------------------------------------------

// Стилевые палитры (фон + foreground для каждой featured-категории).
// Маппится по id → палитра. Новые featured-категории получают дефолтную палитру.
const FEATURED_PALETTE: Record<string, { bg: string; fg: string; sub?: string }> = {
  cleaning: { bg: "bg-violet-soft", fg: "text-violet-deep", sub: "Уборка, окна, химчистка" },
  plumbing: {
    bg: "bg-cyan-soft",
    fg: "text-cyan-deep",
    sub: "Сантехник, электрик, мастер на час",
  },
};
const DEFAULT_PALETTE: { bg: string; fg: string; sub?: string } = {
  bg: "bg-canvas-soft-2",
  fg: "text-ink",
};

// Legacy hardcoded fallback (если is_featured ещё не приехал из БД или 0 категорий).
const FEATURED_FALLBACK = [
  {
    id: "cleaning",
    title: "Клининг",
    subtitle: "Уборка, окна, химчистка",
    bg: "bg-violet-soft",
    fg: "text-violet-deep",
  },
  {
    id: "plumbing",
    title: "Срочный ремонт",
    subtitle: "Сантехник, электрик, мастер на час",
    bg: "bg-cyan-soft",
    fg: "text-cyan-deep",
  },
] as const;

function FeaturedVerticals({ onPress }: { onPress: (id: string) => void }) {
  const { data: featured } = useFeaturedCategories();
  // Если БД ещё не отвечает или не вернула featured — используем fallback (не show empty).
  const items =
    featured && featured.length > 0
      ? featured.map((c) => {
          const palette = FEATURED_PALETTE[c.id] ?? DEFAULT_PALETTE;
          return {
            id: c.id,
            title: c.name_ru,
            subtitle: palette.sub ?? "",
            bg: palette.bg,
            fg: palette.fg,
          };
        })
      : FEATURED_FALLBACK;

  return (
    <View className="mt-8 px-5">
      <View className="flex-row gap-3">
        {items.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => onPress(f.id)}
            accessibilityRole="button"
            accessibilityLabel={f.title}
            className={`flex-1 ${f.bg} rounded-xl p-4 active:opacity-80`}
            style={{ minHeight: 124 }}
          >
            <AppText weight="semibold" className={`text-title-lg ${f.fg}`}>
              {f.title}
            </AppText>
            {f.subtitle ? (
              <AppText className={`mt-1 text-body-sm ${f.fg}`}>{f.subtitle}</AppText>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Top masters — горизонтальная карусель, рендерится только если ≥ 3 карточки
// ----------------------------------------------------------------------------

function TopMasters({ onMasterPress }: { onMasterPress: (id: string) => void }) {
  const { data: masters, isLoading } = useTopMasters(7);

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
            onPress={() => onMasterPress(item.user.id)}
          />
        )}
      />
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
  onPress: () => void;
}

function MasterMiniCard({
  avatarUrl,
  firstName,
  lastName,
  rating,
  ratingCount,
  cityName,
  onPress,
}: MasterMiniCardProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Мастер";

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
          }}
        >
          <Avatar url={avatarUrl} name={fullName} seed={fullName} size="xl" />
        </View>
        <View className="px-3 pb-3">
          <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
            {fullName}
          </AppText>
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

  return (
    <View className="mt-10">
      <View className="px-5">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Категории ремонта
        </AppText>
        <AppText className="mt-1 text-body-sm text-mute">
          Выберите тип работы — увидите мастеров
        </AppText>
      </View>

      {isLoading ? (
        <View className="mt-4 flex-row flex-wrap gap-3 px-5">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
            <View key={i} className="w-[48%] md:w-[31%] lg:w-[23%]">
              <View className="aspect-square rounded-xl bg-canvas-soft-2" />
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
        <View className="mt-4 flex-row flex-wrap gap-3 px-5">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.icon] ?? Wrench;
            return (
              <Pressable
                key={cat.id}
                onPress={() => onCategoryPress(cat.id)}
                accessibilityRole="button"
                accessibilityLabel={cat.name_ru}
                className="w-[48%] md:w-[31%] lg:w-[23%] active:opacity-70"
              >
                <Card variant="soft" padding="md" style={{ aspectRatio: 1 }}>
                  <View className="flex-1 justify-between">
                    {/* Иконка сверху — крупная, через currentColor наследует
                        text-ink (тёмный на canvas-soft, светлый в dark theme). */}
                    <View className="text-ink">
                      <Icon size={28} strokeWidth={1.5} color="currentColor" />
                    </View>
                    {/* Название снизу — semibold body-md, max 2 строки. */}
                    <AppText
                      weight="semibold"
                      className="text-body-md text-ink"
                      numberOfLines={2}
                    >
                      {cat.name_ru}
                    </AppText>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
