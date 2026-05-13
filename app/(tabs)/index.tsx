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
import { ChevronRight, Hammer, Search, User } from "lucide-react-native";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCategoryIcon } from "@/lib/category-icons";
import { AppText } from "@/components/AppText";
import { CitySelector, useCityStore, getCityName } from "@/components/CitySelector";
import { Avatar, Button, Card } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
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
  // onDescribeTask пока не используется в hero, но оставляем в props —
  // родительский HomeTab пробрасывает, в будущем может пригодиться для
  // другого CTA или quick-task сценария.
  void onDescribeTask;

  // onMasterPress пока не используется (TopMasters заменён на FrequentSearches),
  // но оставляем в props — родительский HomeTab прокидывает, может пригодиться
  // если вернём «Лучшие мастера» отдельной секцией ниже.
  void onMasterPress;

  return (
    <View>
      <Hero cityName={cityName} />
      <FrequentSearches onCategoryPress={onCategoryPress} />
      <DescribeTaskCallout onPress={() => onDescribeTask()} />
      <AllCategories onCategoryPress={onCategoryPress} />
    </View>
  );
}

// ----------------------------------------------------------------------------
// FrequentSearches — «Часто ищут» горизонтальная карусель chip-pills.
// Заменила «Лучшие мастера рядом» по запросу. Static-список самых популярных
// услуг для Ингушетии (ремонт), при тапе ведёт на /category/[l2_id].
// ----------------------------------------------------------------------------

const FREQUENT_SEARCHES: { label: string; l2_id: string; icon: string }[] = [
  { label: "Сантехник",          l2_id: "plumbing",                 icon: "Droplet" },
  { label: "Электрик",           l2_id: "electrical",               icon: "Zap" },
  { label: "Плиточник",          l2_id: "tiling",                   icon: "Grid3x3" },
  { label: "Натяжной потолок",   l2_id: "tension-ceilings",         icon: "CloudFog" },
  { label: "Установка двери",    l2_id: "doors",                    icon: "DoorOpen" },
  { label: "Сборка мебели",      l2_id: "furniture",                icon: "Armchair" },
  { label: "Замок",              l2_id: "locks-security",           icon: "Lock" },
  { label: "Кондиционер",        l2_id: "climate",                  icon: "Thermometer" },
  { label: "Окна",               l2_id: "windows",                  icon: "RectangleHorizontal" },
  { label: "Уборка",             l2_id: "cleaning-post-renovation", icon: "Sparkles" },
  { label: "Сварка ворот",       l2_id: "welding",                  icon: "Flame" },
  { label: "Бурение скважин",    l2_id: "drilling-wells",           icon: "Drill" },
];

function FrequentSearches({ onCategoryPress }: { onCategoryPress: (id: string) => void }) {
  // Берём первые 6 — самые ходовые. Yandex-style: 2-col grid плитки,
  // bg-canvas-soft, большая Lucide-иконка справа-снизу (декоративно)
  // + название слева-сверху semibold.
  const top6 = FREQUENT_SEARCHES.slice(0, 6);
  return (
    <View className="mt-10 px-5">
      <AppText weight="semibold" className="text-title-lg text-ink">
        Часто ищут
      </AppText>
      <View className="mt-3 flex-row flex-wrap gap-3">
        {top6.map((item) => {
          const Icon = getCategoryIcon(item.icon);
          return (
            <Pressable
              key={item.l2_id + item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => onCategoryPress(item.l2_id)}
              className="w-[48%] rounded-xl bg-canvas-soft p-4 active:opacity-70 overflow-hidden"
              style={{ minHeight: 100 }}
            >
              <AppText
                weight="semibold"
                className="text-body-md text-ink"
                numberOfLines={2}
              >
                {item.label}
              </AppText>
              {/* Большая тематичная иконка справа-снизу — декор, как
                  «фотка-плитка» у Яндекс.Услуг. */}
              <View
                className="text-ink"
                style={{ position: "absolute", right: 8, bottom: 8, opacity: 0.85 }}
              >
                <Icon size={48} strokeWidth={1.25} color="currentColor" />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// DescribeTaskCallout — Vercel-card блок «Опишите задачу — мастера найдут вас».
// Doodle (unboxing — метафора «открыть возможности») + копи + CTA.
// Размещается между TopMasters и AllCategories на главной.
// ----------------------------------------------------------------------------

function DescribeTaskCallout({ onPress }: { onPress: () => void }) {
  return (
    <View className="mt-10 mx-5 rounded-xl bg-canvas-soft overflow-hidden">
      <View className="flex-row items-center p-5 gap-4">
        {/* Большая Lucide-иконка молотка — тематично без человеков/живых. */}
        <View className="shrink-0 h-24 w-24 items-center justify-center rounded-full bg-canvas text-ink">
          <Hammer size={44} strokeWidth={1.25} color="currentColor" />
        </View>
        <View className="flex-1">
          <AppText weight="semibold" className="text-title-md text-ink">
            Опишите задачу — мастера ответят:
          </AppText>
          <AppText className="mt-1 text-body-sm text-mute">
            Готов сделать заказ за 1000 ₽! Выберете себе подходящего.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Создать заказ"
            onPress={onPress}
            className="mt-3 self-start h-9 px-4 rounded-full bg-primary active:opacity-85 items-center justify-center"
          >
            <AppText weight="semibold" className="text-body-sm text-on-primary">
              Создать заказ
            </AppText>
          </Pressable>
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
  // Город не используется в заголовке, но оставляем для будущего «… в Магасе».
  void cityName;
  return (
    <View className="px-5 mt-10">
      <AppText weight="display" className="text-display-lg tracking-tight text-ink">
        Найдутся мастера
      </AppText>

      {/* PRIMARY: большой SearchBar — главное действие. По паттерну TaskRabbit
          search-first: один visual-anchor сверху, никаких отвлекающих
          элементов вокруг (H1 + search достаточно). */}
      <View className="mt-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Поиск мастеров"
          onPress={() => router.push("/search" as never)}
          className="flex-row items-center gap-3 h-14 rounded-full bg-canvas-soft border border-hairline px-5 active:opacity-70"
        >
          <Search size={20} strokeWidth={1.75} color="currentColor" className="text-mute" />
          <AppText className="flex-1 text-body-md text-mute">
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
        <View className="mt-4">
          {categories.map((cat, idx) => {
            const Icon = getCategoryIcon(cat.icon);
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
                {/* Иконка в soft-круге слева. text-ink через className → currentColor наследуется. */}
                <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft text-ink">
                  <Icon size={20} strokeWidth={1.5} color="currentColor" />
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
        </View>
      )}
    </View>
  );
}
