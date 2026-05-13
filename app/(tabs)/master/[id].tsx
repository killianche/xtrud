/**
 * Публичная страница мастера `/master/[id]` — Sprint 24 (Thumbtack pattern).
 *
 * Структура:
 *   hero 16:9 (avatar_url cover + gradient overlay + имя/бейджи поверх)
 *    → trust-row (рейтинг, кол-во работ, город) — компактно сразу под hero
 *    → bio
 *    → stats chips (опыт / радиус / инструмент / транспорт)
 *    → категории
 *    → портфолио (большой grid)
 *    → отзывы
 *   + sticky bottom CTA «Создать заказ» (скрыта, если открыл свой профиль)
 *
 * Тап с любого места (отклик, чат, поиск) ведёт сюда.
 */

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { CardListSkeleton, HeroSkeleton, Skeleton } from "@/components/Skeleton";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { MasterServicesList } from "@/features/master-services/MasterServicesList";
import { ReviewsSection } from "@/features/master-view/ReviewsSection";
import {
  useMasterCategoriesPublic,
  useMasterPublicProfile,
  useReviewsForTarget,
} from "@/features/master-view/use-master-public";
import { PortfolioGrid } from "@/features/profile/PortfolioGrid";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import {
  pluralizeClosedDeals as pluralizeDeals,
  pluralizeReviews,
  pluralizeYears,
} from "@/lib/pluralize";
import { useThemeColors } from "@/lib/use-theme-color";

export default function MasterPublicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const masterId = typeof params.id === "string" ? params.id : null;

  const { session } = useAuthSession();
  const currentUserId = session?.user?.id;
  const isOwnProfile = !!masterId && masterId === currentUserId;

  const profile = useMasterPublicProfile(masterId);
  const categories = useMasterCategoriesPublic(masterId);
  const portfolio = useMasterPortfolio(masterId);
  const reviews = useReviewsForTarget(masterId, "client_to_master");
  const refresh = usePullToRefresh();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const tc = useThemeColors([
    "ink",
    "muted-soft",
    "body",
    "success",
    "warning",
    "error",
    "on-primary",
    "on-dark",
  ]);

  const fullName = useMemo(() => {
    if (!profile.data?.user) return "";
    const u = profile.data.user;
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || "Мастер";
  }, [profile.data]);

  const onCreateOrder = () => {
    // Pre-filled order create: pre-выбранная категория (первая из L2 мастера).
    // Когда у master_categories несколько — клиент выберет в форме.
    const firstL2 = categories.data?.[0]?.l2_id ?? null;
    if (firstL2) {
      router.push(`/(tabs)/orders/new?l2=${firstL2}` as never);
    } else {
      router.push("/(tabs)/orders/new" as never);
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        {/* Loading skeleton */}
        {profile.isLoading && (
          <>
            <Skeleton variant="rect" className="aspect-[16/9]" radius={0} />
            <View className="mt-6">
              <HeroSkeleton />
              <View className="mt-8 px-6">
                <CardListSkeleton count={3} />
              </View>
            </View>
          </>
        )}

        {/* Error */}
        {profile.error && (
          <View className="px-6" style={{ paddingTop: insets.top + 32, paddingBottom: 24 }}>
            <CircleAlert size={32} strokeWidth={1.5} color={tc.error} />
            <AppText className="mt-3 text-body-sm text-error">
              Не удалось загрузить профиль. {profile.error.message}
            </AppText>
          </View>
        )}

        {!profile.isLoading && !profile.error && !profile.data && (
          <View className="items-center px-6" style={{ paddingTop: insets.top + 80 }}>
            <AppText className="text-body-md text-muted">Профиль не найден.</AppText>
          </View>
        )}

        {profile.data?.user && (
          <>
            {/* Hero 16:9 — avatar_url как cover + gradient overlay */}
            <View className="aspect-[16/9] w-full overflow-hidden bg-surface-dark">
              {profile.data.user.avatar_url ? (
                <Image
                  source={{ uri: profile.data.user.avatar_url }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View className="flex-1 items-center justify-center bg-surface-2">
                  <Avatar url={null} name={fullName} seed={profile.data.user.id} size="xl" />
                </View>
              )}
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
                locations={[0.5, 1]}
                style={{ position: "absolute", inset: 0 }}
              />

              {/* Back button — на hero, на dark overlay */}
              <View
                className="absolute left-3 flex-row items-center"
                style={{ top: insets.top + 4 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Назад"
                  onPress={() => router.back()}
                  hitSlop={12}
                  className="h-10 w-10 items-center justify-center rounded-full bg-black/40 active:opacity-70"
                >
                  <ChevronLeft size={24} strokeWidth={1.75} color={tc["on-dark"]} />
                </Pressable>
              </View>

              {/* Имя + бейджи поверх gradient */}
              <View className="absolute right-6 bottom-5 left-6">
                <AppText
                  weight="display"
                  className="text-display-md tracking-tight text-on-dark"
                  numberOfLines={2}
                >
                  {fullName}
                </AppText>
                <View className="mt-2 flex-row flex-wrap items-center gap-2">
                  <View className="rounded-pill bg-white/15 px-3 py-1">
                    <AppText weight="medium" className="text-caption text-on-dark">
                      {profile.data.user.is_master ? "Мастер" : "Пользователь"}
                    </AppText>
                  </View>
                  {profile.data.master?.status === "active" && (
                    <View className="flex-row items-center gap-1 rounded-pill bg-success-soft px-2.5 py-1">
                      <CheckCircle2 size={12} strokeWidth={2} color={tc.success} />
                      <AppText weight="medium" className="text-caption-xs text-success">
                        Активен
                      </AppText>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Trust-row: рейтинг + работы + город — одна строка под hero */}
            <View className="mt-5 flex-row flex-wrap items-center gap-x-4 gap-y-2 px-6">
              {profile.data.master?.rating_overall_avg != null &&
              profile.data.master.rating_overall_count > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Star size={16} strokeWidth={2} color={tc.warning} fill={tc.warning} />
                  <AppText weight="semibold" className="text-body-md text-ink">
                    {profile.data.master.rating_overall_avg.toFixed(1)}
                  </AppText>
                  <AppText className="text-body-sm text-muted">
                    ({pluralizeReviews(profile.data.master.rating_overall_count)})
                  </AppText>
                </View>
              ) : (
                <AppText className="text-body-sm text-muted">Пока нет отзывов</AppText>
              )}
              {profile.data.master?.closed_deals != null &&
                profile.data.master.closed_deals > 0 && (
                  <AppText className="text-body-sm text-muted">
                    {pluralizeDeals(profile.data.master.closed_deals)}
                  </AppText>
                )}
              {profile.data.city && (
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} strokeWidth={1.75} color={tc["muted-soft"]} />
                  <AppText className="text-body-sm text-muted">
                    {profile.data.city.name}
                    {profile.data.user.district ? `, ${profile.data.user.district}` : ""}
                  </AppText>
                </View>
              )}
            </View>

            {/* Bio */}
            {profile.data.master?.bio && (
              <View className="mt-7 px-6">
                <AppText weight="semibold" className="text-title-lg text-ink">
                  О мастере
                </AppText>
                <AppText className="mt-2 text-body-md text-body">{profile.data.master.bio}</AppText>
              </View>
            )}

            {/* Stats chips */}
            {profile.data.master && (
              <View className="mt-7 flex-row flex-wrap gap-2 px-6">
                {profile.data.master.experience_years != null &&
                  profile.data.master.experience_years > 0 && (
                    <StatChip
                      icon={<Briefcase size={14} strokeWidth={1.75} color={tc.body} />}
                      label={`Опыт ${pluralizeYears(profile.data.master.experience_years)}`}
                    />
                  )}
                {profile.data.master.service_radius_km > 0 && (
                  <StatChip
                    icon={<MapPin size={14} strokeWidth={1.75} color={tc.body} />}
                    label={`Радиус ${profile.data.master.service_radius_km} км`}
                  />
                )}
                {profile.data.master.has_tools && (
                  <StatChip
                    icon={<Wrench size={14} strokeWidth={1.75} color={tc.body} />}
                    label="Свой инструмент"
                  />
                )}
                {profile.data.master.has_transport && (
                  <StatChip
                    icon={<Truck size={14} strokeWidth={1.75} color={tc.body} />}
                    label="Свой транспорт"
                  />
                )}
              </View>
            )}

            {/* Категории */}
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

            {/* Прайс-лист */}
            {masterId && (
              <View className="mt-8 px-6">
                <MasterServicesList masterId={masterId} />
              </View>
            )}

            {/* Портфолио */}
            {(portfolio.data?.length ?? 0) > 0 && (
              <View className="mt-8 px-6">
                <AppText weight="semibold" className="text-title-lg text-ink">
                  Портфолио
                </AppText>
                <View className="mt-4">
                  <PortfolioGrid
                    items={portfolio.data ?? []}
                    onOpen={(item) => {
                      const idx = (portfolio.data ?? []).findIndex((p) => p.id === item.id);
                      if (idx >= 0) setLightboxIndex(idx);
                    }}
                  />
                </View>
              </View>
            )}

            {/* Отзывы */}
            <ReviewsSection title="Отзывы" emptyText="У мастера ещё нет отзывов." query={reviews} />
          </>
        )}
      </ScrollView>

      {/* Sticky bottom CTA — Thumbtack pattern. Скрыта на собственном профиле. */}
      {!isOwnProfile && profile.data?.user && (
        <View
          className="absolute right-0 bottom-0 left-0 border-hairline-soft border-t bg-canvas px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Создать заказ"
            onPress={onCreateOrder}
            className="h-12 items-center justify-center rounded-md bg-primary active:opacity-80"
          >
            <AppText weight="semibold" className="text-button" style={{ color: tc["on-primary"] }}>
              Создать заказ
            </AppText>
          </Pressable>
        </View>
      )}

      <PortfolioLightbox
        items={portfolio.data ?? []}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChangeIndex={setLightboxIndex}
      />
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
