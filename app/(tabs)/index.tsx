import { useRouter } from "expo-router";
import { Bell, Moon, Sun } from "lucide-react-native";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { CategoryTile } from "@/components/CategoryTile";
import { MasterPreviewCard } from "@/components/MasterPreviewCard";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { Skeleton, TileSkeleton } from "@/components/Skeleton";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useSetActiveRole } from "@/features/auth/use-set-active-role";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { MasterHomeContent } from "@/features/master-view/MasterHomeContent";
import { useTopMasters } from "@/features/master-view/use-top-masters";
import {
  useRealtimeNotifications,
  useUnreadNotificationsCount,
} from "@/features/notifications/use-notifications";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useThemeColors } from "@/lib/use-theme-color";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const setActiveRole = useSetActiveRole();

  const greeting = user?.first_name ? `Привет, ${user.first_name}` : "С чего начнём?";
  const activeRole = user?.active_role ?? "client";
  const refresh = usePullToRefresh();
  const { colorScheme, setPreference } = useColorScheme();
  const tc = useThemeColors(["ink", "error"]);
  const isDark = colorScheme === "dark";

  useRealtimeNotifications(userId);
  const { data: unreadNotifs = 0 } = useUnreadNotificationsCount(userId);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
    >
      {/* Header */}
      <View className="flex-row items-start justify-between px-6">
        <View className="flex-1">
          <AppText weight="display" className="text-display-md tracking-tight text-ink">
            {greeting}
          </AppText>
          {user?.is_master && user.active_role && userId && (
            <View className="mt-3">
              <RoleSwitcher
                activeRole={user.active_role}
                disabled={setActiveRole.isPending}
                onChange={(role) => setActiveRole.mutate({ userId, role })}
              />
            </View>
          )}
        </View>

        {/* Тема + уведомления + профиль */}
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDark ? "Светлая тема" : "Тёмная тема"}
            onPress={() => setPreference(isDark ? "light" : "dark")}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          >
            {isDark ? (
              <Sun size={20} strokeWidth={1.75} color={tc.ink} />
            ) : (
              <Moon size={20} strokeWidth={1.75} color={tc.ink} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Уведомления"
            onPress={() => router.push("/(tabs)/notifications" as never)}
            hitSlop={8}
            className="relative h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          >
            <Bell size={20} strokeWidth={1.75} color={tc.ink} />
            {unreadNotifs > 0 && (
              <View
                className="absolute -right-0.5 -top-0.5 h-4 min-w-4 items-center justify-center rounded-full px-1"
                style={{ backgroundColor: tc.error }}
              >
                <AppText
                  weight="bold"
                  className="text-[10px] leading-[14px] text-white"
                >
                  {unreadNotifs > 99 ? "99+" : String(unreadNotifs)}
                </AppText>
              </View>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Профиль"
            onPress={() => router.push("/(tabs)/profile" as never)}
            hitSlop={12}
            className="active:opacity-70"
          >
            <Avatar
              url={user?.avatar_url}
              name={user?.first_name ?? null}
              seed={userId ?? null}
              size="md"
            />
          </Pressable>
        </View>
      </View>

      {/* Branching контент: master vs client */}
      <View className="mt-10">
        {activeRole === "master" && userId ? (
          <MasterHomeContent userId={userId} />
        ) : (
          <ClientHomeContent
            onCategoryPress={(catId) => router.push(`/category/${catId}` as never)}
            onMasterPress={(masterId) => router.push(`/master/${masterId}` as never)}
          />
        )}
      </View>
    </ScrollView>
  );
}

// ----------------------------------------------------------------------------
// Client home content — каталог категорий (как было в sprint 2.3 + 3.4).
// ----------------------------------------------------------------------------

interface ClientHomeContentProps {
  onCategoryPress: (catId: string) => void;
  onMasterPress: (masterId: string) => void;
}

function ClientHomeContent({ onCategoryPress, onMasterPress }: ClientHomeContentProps) {
  const { data: categories, isLoading, error, refetch } = useVisibleCategories();
  const topMasters = useTopMasters(7);
  const showMasters = (topMasters.data?.length ?? 0) > 0 || topMasters.isLoading;

  return (
    <View>
      {/* Top-recommended masters — горизонтальный карусель (TaskRabbit Browse). */}
      {showMasters && (
        <View>
          <View className="px-6">
            <AppText weight="semibold" className="text-title-lg text-ink">
              Лучшие мастера
            </AppText>
            <AppText className="mt-1 text-body-sm text-muted">
              По рейтингу и количеству завершённых работ
            </AppText>
          </View>

          {topMasters.isLoading ? (
            <View className="mt-4 flex-row gap-3 px-6">
              <Skeleton variant="rect" width={180} height={232} radius={12} />
              <Skeleton variant="rect" width={180} height={232} radius={12} />
              <Skeleton variant="rect" width={180} height={232} radius={12} />
            </View>
          ) : (
            <FlatList
              data={topMasters.data ?? []}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
              className="mt-4"
              keyExtractor={(m) => m.user.id}
              renderItem={({ item }) => (
                <MasterPreviewCard
                  id={item.user.id}
                  avatarUrl={item.user.avatar_url}
                  firstName={item.user.first_name}
                  lastName={item.user.last_name}
                  ratingAvg={item.profile.rating_overall_avg}
                  ratingCount={item.profile.rating_overall_count}
                  closedDeals={item.profile.closed_deals}
                  experienceYears={item.profile.experience_years}
                  cityName={item.city?.name ?? null}
                  variant="horizontal"
                  onPress={() => onMasterPress(item.user.id)}
                />
              )}
            />
          )}
        </View>
      )}

      <View className={`px-6 ${showMasters ? "mt-10" : ""}`}>
        <AppText weight="semibold" className="text-title-lg text-ink">
          Категории
        </AppText>
        <AppText className="mt-1 text-body-sm text-muted">Выберите, какой мастер вам нужен</AppText>
      </View>

      {isLoading && (
        <View className="mt-4 flex-row flex-wrap gap-3 px-6">
          {Array.from({ length: 6 }).map((_, i) => (
            // Индекс позиции, не идентификатор — порядок плиток-скелетонов фиксирован.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
            <View key={i} className="w-[48%] md:w-[31%] lg:w-[23%]">
              <TileSkeleton />
            </View>
          ))}
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить категории. {error.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => refetch()}
            className="mt-3 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
          >
            <AppText weight="medium" className="text-caption text-ink">
              Повторить
            </AppText>
          </Pressable>
        </View>
      )}

      {categories && categories.length > 0 && (
        <View className="mt-4 flex-row flex-wrap gap-3 px-6">
          {categories.map((cat) => (
            <View key={cat.id} className="w-[48%] md:w-[31%] lg:w-[23%]">
              <CategoryTile
                name={cat.name_ru}
                iconName={cat.icon}
                coverUrl={cat.cover_image_url}
                onPress={() => onCategoryPress(cat.id)}
              />
            </View>
          ))}
        </View>
      )}

      {categories && categories.length === 0 && !isLoading && !error && (
        <View className="mt-8 px-6">
          <AppText className="text-body-md text-muted">
            Категории ещё не настроены. Свяжитесь с поддержкой.
          </AppText>
        </View>
      )}
    </View>
  );
}
