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
import { Pencil, User } from "lucide-react-native";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CitySelector, useCityStore, getCityName } from "@/components/CitySelector";
import { Avatar, Button, Card, Chip, SearchBar } from "@/components/ui";
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
          onDescribeTask={() => router.push("/orders/new" as never)}
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
  onDescribeTask: () => void;
}

function ClientHome({ onCategoryPress, onMasterPress, onDescribeTask }: ClientHomeProps) {
  const cityId = useCityStore((s) => s.cityId);
  const cityName = getCityName(cityId);

  return (
    <View>
      <Hero cityName={cityName} onDescribeTask={onDescribeTask} />
      <FeaturedVerticals onPress={onCategoryPress} />
      <TopMasters onMasterPress={onMasterPress} />
      <AllCategories onCategoryPress={onCategoryPress} />
    </View>
  );
}

// ----------------------------------------------------------------------------
// Hero — заголовок + поиск + CTA
// ----------------------------------------------------------------------------

function Hero({ cityName, onDescribeTask }: { cityName: string; onDescribeTask: () => void }) {
  return (
    <View className="px-5 mt-8">
      <AppText weight="display" className="text-display-lg tracking-tight text-ink">
        Услуги в {cityName === "Магас" ? "Ингушетии" : cityName}
      </AppText>
      <AppText className="mt-2 text-body-md text-body">
        Опишите задачу — мастера сами вам напишут
      </AppText>

      <View className="mt-5">
        <SearchBar placeholder="Например: установить кондиционер" />
      </View>

      <View className="mt-3">
        <Button
          size="lg"
          fullWidth
          leftIcon={<Pencil size={16} strokeWidth={1.75} color="#ffffff" />}
          onPress={onDescribeTask}
        >
          Описать задачу
        </Button>
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <Chip size="sm" variant="default" mono>
          Бесплатно
        </Chip>
        <AppText className="text-body-sm text-mute">·</AppText>
        <Chip size="sm" variant="default" mono>
          Отвечают за 30 минут
        </Chip>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Featured verticals — клининг + срочный ремонт (приоритетные)
// ----------------------------------------------------------------------------

const FEATURED = [
  {
    id: "cleaning",
    title: "Клининг",
    subtitle: "Уборка, окна, химчистка",
    bg: "bg-violet-soft",
    fg: "text-violet-deep",
  },
  {
    id: "repair-urgent",
    title: "Срочный ремонт",
    subtitle: "Сантехник, электрик, мастер на час",
    bg: "bg-cyan-soft",
    fg: "text-cyan-deep",
  },
] as const;

function FeaturedVerticals({ onPress }: { onPress: (id: string) => void }) {
  return (
    <View className="mt-8 px-5">
      <View className="flex-row gap-3">
        {FEATURED.map((f) => (
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
            <AppText className={`mt-1 text-body-sm ${f.fg}`}>{f.subtitle}</AppText>
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
          Все категории
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
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => onCategoryPress(cat.id)}
              accessibilityRole="button"
              accessibilityLabel={cat.name_ru}
              className="w-[48%] md:w-[31%] lg:w-[23%] active:opacity-70"
            >
              <Card variant="soft" padding="md" style={{ aspectRatio: 1, justifyContent: "flex-end" }}>
                <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={2}>
                  {cat.name_ru}
                </AppText>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
