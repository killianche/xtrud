/**
 * Публичная страница мастера `/master/[id]`.
 *
 * Sprint 8.3 — Profi/Thumbtack-style карточка:
 *  hero (avatar + name + rating + city)
 *   → опыт/радиус/инструмент/транспорт chips
 *   → bio
 *   → категории chips
 *   → portfolio grid
 *   → отзывы list
 *
 * Тап с любого места где упоминается мастер (отклик, чат, и т.д.) ведёт сюда.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  MapPin,
  Star,
  Truck,
  Wrench,
} from "lucide-react-native";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { ReviewsSection } from "@/features/master-view/ReviewsSection";
import {
  useMasterCategoriesPublic,
  useMasterPublicProfile,
  useReviewsForTarget,
} from "@/features/master-view/use-master-public";
import { PortfolioGrid } from "@/features/profile/PortfolioGrid";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

export default function MasterPublicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const masterId = typeof params.id === "string" ? params.id : null;

  const profile = useMasterPublicProfile(masterId);
  const categories = useMasterCategoriesPublic(masterId);
  const portfolio = useMasterPortfolio(masterId);
  const reviews = useReviewsForTarget(masterId, "client_to_master");
  const refresh = usePullToRefresh();

  const fullName = useMemo(() => {
    if (!profile.data?.user) return "";
    const u = profile.data.user;
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || "Мастер";
  }, [profile.data]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        {profile.isLoading && (
          <View className="mt-20 items-center">
            <ActivityIndicator />
          </View>
        )}

        {profile.error && (
          <View className="mt-20 items-center px-6">
            <CircleAlert size={32} strokeWidth={1.5} color="#ef4444" />
            <AppText className="mt-3 text-body-sm text-error">
              Не удалось загрузить профиль. {profile.error.message}
            </AppText>
          </View>
        )}

        {!profile.isLoading && !profile.error && !profile.data && (
          <View className="mt-20 items-center px-6">
            <AppText className="text-body-md text-muted">Профиль не найден.</AppText>
          </View>
        )}

        {profile.data?.user && (
          <>
            {/* Hero */}
            <View className="items-center px-6">
              <Avatar
                url={profile.data.user.avatar_url}
                name={fullName}
                seed={profile.data.user.id}
                size="xl"
              />
              <AppText weight="bold" className="mt-4 text-display-sm text-ink">
                {fullName}
              </AppText>

              <View className="mt-2 flex-row items-center gap-2">
                <View className="rounded-pill bg-surface-2 px-3 py-1">
                  <AppText weight="medium" className="text-caption text-body">
                    {profile.data.user.is_master ? "Мастер" : "Пользователь"}
                  </AppText>
                </View>
                {profile.data.master?.status === "active" && (
                  <View className="flex-row items-center gap-1 rounded-pill bg-success-soft px-2.5 py-1">
                    <CheckCircle2 size={12} strokeWidth={2} color="#10b981" />
                    <AppText weight="medium" className="text-caption-xs text-success">
                      Активен
                    </AppText>
                  </View>
                )}
              </View>

              <View className="mt-3 flex-row items-center gap-1">
                {profile.data.master?.rating_overall_avg != null &&
                profile.data.master.rating_overall_count > 0 ? (
                  <>
                    <Star size={16} strokeWidth={2} color="#f59e0b" fill="#f59e0b" />
                    <AppText weight="semibold" className="text-body-md text-ink">
                      {profile.data.master.rating_overall_avg.toFixed(1)}
                    </AppText>
                    <AppText className="text-body-sm text-muted">
                      ({pluralizeReviews(profile.data.master.rating_overall_count)})
                    </AppText>
                  </>
                ) : (
                  <AppText className="text-body-sm text-muted">Пока нет отзывов</AppText>
                )}
                {profile.data.master?.closed_deals != null &&
                  profile.data.master.closed_deals > 0 && (
                    <>
                      <AppText className="text-body-sm text-muted">·</AppText>
                      <AppText className="text-body-sm text-muted">
                        {pluralizeDeals(profile.data.master.closed_deals)}
                      </AppText>
                    </>
                  )}
              </View>

              {profile.data.city && (
                <View className="mt-2 flex-row items-center gap-1">
                  <MapPin size={14} strokeWidth={1.75} color="#71717a" />
                  <AppText className="text-body-sm text-muted">
                    {profile.data.city.name}
                    {profile.data.user.district ? `, ${profile.data.user.district}` : ""}
                  </AppText>
                </View>
              )}
            </View>

            {/* Stats chips */}
            {profile.data.master && (
              <View className="mt-6 flex-row flex-wrap gap-2 px-6">
                {profile.data.master.experience_years != null &&
                  profile.data.master.experience_years > 0 && (
                    <StatChip
                      icon={<Briefcase size={14} strokeWidth={1.75} color="#374151" />}
                      label={`Опыт ${pluralizeYears(profile.data.master.experience_years)}`}
                    />
                  )}
                {profile.data.master.service_radius_km > 0 && (
                  <StatChip
                    icon={<MapPin size={14} strokeWidth={1.75} color="#374151" />}
                    label={`Радиус ${profile.data.master.service_radius_km} км`}
                  />
                )}
                {profile.data.master.has_tools && (
                  <StatChip
                    icon={<Wrench size={14} strokeWidth={1.75} color="#374151" />}
                    label="Свой инструмент"
                  />
                )}
                {profile.data.master.has_transport && (
                  <StatChip
                    icon={<Truck size={14} strokeWidth={1.75} color="#374151" />}
                    label="Свой транспорт"
                  />
                )}
              </View>
            )}

            {/* Bio */}
            {profile.data.master?.bio && (
              <View className="mt-8 px-6">
                <AppText weight="semibold" className="text-title-lg text-ink">
                  О мастере
                </AppText>
                <AppText className="mt-2 text-body-md text-body">{profile.data.master.bio}</AppText>
              </View>
            )}

            {/* Categories */}
            {(categories.data?.length ?? 0) > 0 && (
              <View className="mt-8 px-6">
                <AppText weight="semibold" className="text-title-lg text-ink">
                  Категории
                </AppText>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {categories.data?.map((mc) => (
                    <View key={mc.id} className="rounded-pill bg-accent-soft px-3 py-2">
                      <AppText weight="medium" className="text-caption text-accent">
                        {mc.l2?.name_ru ?? mc.l2_id}
                      </AppText>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Portfolio */}
            {(portfolio.data?.length ?? 0) > 0 && (
              <View className="mt-8 px-6">
                <AppText weight="semibold" className="text-title-lg text-ink">
                  Портфолио
                </AppText>
                <View className="mt-4">
                  <PortfolioGrid items={portfolio.data ?? []} />
                </View>
              </View>
            )}

            {/* Reviews */}
            <ReviewsSection title="Отзывы" emptyText="У мастера ещё нет отзывов." query={reviews} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------------

function StatChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-2">
      {icon}
      <AppText weight="medium" className="text-caption text-body">
        {label}
      </AppText>
    </View>
  );
}

function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} отзыв`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} отзыва`;
  return `${count} отзывов`;
}

function pluralizeDeals(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} заказ выполнен`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
    return `${count} заказа выполнено`;
  return `${count} заказов выполнено`;
}

function pluralizeYears(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} год`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} года`;
  return `${count} лет`;
}
