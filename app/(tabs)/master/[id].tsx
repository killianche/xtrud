/**
 * Master detail — публичная карточка мастера, conversion-критичный экран.
 *
 * Vercel-based DESIGN.md + Thumbtack/Airbnb pattern:
 *   - Hero: 16:9 фото (avatar_url cover) с back/share/flag в углах
 *   - Trust-row сразу под hero: ★ + город + опыт + кол-во работ (mono accent)
 *   - Имя + bio
 *   - Категории chips
 *   - Услуги + прайс (existing MasterServicesList)
 *   - Портфолио grid (existing PortfolioGrid + lightbox)
 *   - Отзывы (existing ReviewsSection)
 *   - Sticky bottom CTA «Написать в чат» (только если не свой профиль)
 *
 * Анон-friendly: CTA открывает LoginWall на тапе если userId == null.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2, ChevronLeft, Flag, MapPin, Star, Users, Wrench } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, Button, Card, Chip } from "@/components/ui";

/** Лейблы режимов прайсинга для отображения на карточке категории мастера. */
const PRICING_MODE_LABELS: Record<string, string> = {
  per_hour: "Почасовая оплата",
  per_unit: "За единицу работы",
  negotiable: "Цена договорная",
  on_quote: "По смете",
};
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
import { ReportModal } from "@/features/reports/ReportModal";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import {
  pluralizeClosedDeals,
  pluralizeReviews,
  pluralizeYears,
} from "@/lib/pluralize";

const HERO_RATIO = 16 / 9;
const STICKY_BAR_HEIGHT = 64;

export default function MasterPublicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const masterId = typeof params.id === "string" ? params.id : null;

  const { session } = useAuthSession();
  const currentUserId = session?.user?.id;
  const isOwnProfile = !!masterId && masterId === currentUserId;
  const isAnon = !currentUserId;

  const profile = useMasterPublicProfile(masterId);
  const categories = useMasterCategoriesPublic(masterId);
  const portfolio = useMasterPortfolio(masterId);
  const reviews = useReviewsForTarget(masterId, "client_to_master");
  const refresh = usePullToRefresh();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const u = profile.data?.user;
  const m = profile.data?.master;
  const fullName =
    [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "Мастер";
  const cityName = profile.data?.city?.name ?? null;
  const ratingAvg = m?.rating_overall_avg ?? null;
  const ratingCount = m?.rating_overall_count ?? 0;
  const closedDeals = m?.closed_deals ?? 0;
  const experienceYears = m?.experience_years ?? null;

  const handleContact = () => {
    if (isAnon) {
      router.push("/(auth)/phone" as never);
      return;
    }
    // Открываем существующий или создаём новый чат: вызов RPC скрыт во flow.
    // На данном MVP — направляем в orders/new с masterId hint.
    if (masterId) router.push(`/orders/new?master_id=${masterId}` as never);
  };

  if (profile.isLoading) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <AppText className="text-mute text-body-md">Загружаем профиль…</AppText>
      </View>
    );
  }

  if (profile.error || !profile.data) {
    return (
      <View
        className="flex-1 bg-canvas items-center justify-center px-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <AppText weight="semibold" className="text-ink text-title-lg">
          Не удалось загрузить профиль
        </AppText>
        <AppText className="text-body mt-2 text-center">
          {profile.error?.message ?? "Попробуйте позже"}
        </AppText>
        <View className="mt-6">
          <Button onPress={() => router.back()}>Назад</Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + (isOwnProfile ? 24 : STICKY_BAR_HEIGHT + 24),
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        {/* HERO 16:9 — фото с overlay-кнопками */}
        <View
          style={{
            width: "100%",
            aspectRatio: HERO_RATIO,
            backgroundColor: "#1a1a1a",
            position: "relative",
          }}
        >
          {u?.avatar_url ? (
            <Image
              source={{ uri: u.avatar_url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center bg-canvas-soft-2">
              <Avatar name={fullName} seed={masterId} size="xl" />
            </View>
          )}
          {/* Gradient overlay для читаемости иконок */}
          <LinearGradient
            colors={["rgba(0,0,0,0.4)", "transparent"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80 }}
          />
          {/* Back + Flag */}
          <View
            className="absolute left-0 right-0 flex-row items-center justify-between px-4"
            style={{ top: insets.top + 8 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад"
              onPress={() => router.back()}
              className="h-9 w-9 items-center justify-center rounded-full bg-canvas active:opacity-70"
            >
              <ChevronLeft size={20} strokeWidth={2} color="currentColor" />
            </Pressable>
            {!isOwnProfile && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Пожаловаться"
                onPress={() => setReportOpen(true)}
                className="h-9 w-9 items-center justify-center rounded-full bg-canvas active:opacity-70"
              >
                <Flag size={18} strokeWidth={1.75} color="currentColor" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Trust-row + имя */}
        <View className="px-5 mt-4">
          <AppText
            weight="display"
            className="text-display-md tracking-tight text-ink"
          >
            {fullName}
          </AppText>

          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            {ratingAvg !== null && ratingCount > 0 ? (
              <View className="flex-row items-center gap-1">
                <Star size={14} strokeWidth={2} color="currentColor" className="text-ink" />
                <AppText weight="mono" className="text-ink text-mono-sm">
                  {ratingAvg.toFixed(1)}
                </AppText>
                <AppText weight="mono" className="text-mute text-mono-sm">
                  ({pluralizeReviews(ratingCount)})
                </AppText>
              </View>
            ) : null}

            {cityName ? (
              <View className="flex-row items-center gap-1">
                <MapPin size={14} strokeWidth={1.75} color="currentColor" className="text-mute" />
                <AppText className="text-body text-body-sm">{cityName}</AppText>
              </View>
            ) : null}

            {experienceYears !== null && experienceYears > 0 ? (
              <Chip size="sm" mono>
                {pluralizeYears(experienceYears)} опыта
              </Chip>
            ) : null}

            {closedDeals > 0 ? (
              <Chip size="sm" mono>
                {pluralizeClosedDeals(closedDeals)}
              </Chip>
            ) : null}

            {/* Бейдж бригады/компании — ключевой trust-сигнал для конструкции
                «работаю не один, есть команда». По умолчанию account_type='solo'
                и бейдж не показывается. */}
            {m?.account_type === "brigade" ? (
              <Chip
                size="sm"
                leftIcon={<Users size={12} strokeWidth={1.75} color="currentColor" />}
              >
                Бригада{m.team_size && m.team_size > 1 ? ` ${m.team_size} чел.` : ""}
              </Chip>
            ) : null}
            {m?.account_type === "company" ? (
              <Chip
                size="sm"
                leftIcon={<Building2 size={12} strokeWidth={1.75} color="currentColor" />}
              >
                Компания
              </Chip>
            ) : null}
          </View>

          {/* Bio */}
          {m?.bio ? (
            <AppText className="text-body text-body-md mt-4 leading-6">{m.bio}</AppText>
          ) : null}
        </View>

        {/* Что делаю — рич-секция по каждой L2-категории мастера.
            У одного мастера может быть несколько категорий (Электрика +
            Сантехника + Отделочные), у каждой свой category_bio, pricing_mode,
            радиус выезда — это видно явно, а не одним общим chip-rowом. */}
        {categories.data && categories.data.length > 0 ? (
          <View className="px-5 mt-8">
            <AppText weight="semibold" className="text-ink text-title-md mb-3">
              Что делаю
            </AppText>
            <View className="gap-3">
              {categories.data.map((c) => {
                const name = c.l2?.name_ru ?? c.l2_id;
                const pricingLabel = PRICING_MODE_LABELS[c.pricing_mode] ?? null;
                return (
                  <Card key={c.l2_id} variant="soft" padding="md">
                    <View className="flex-row items-center justify-between gap-2">
                      <AppText weight="semibold" className="text-ink text-body-md">
                        {name}
                      </AppText>
                      {pricingLabel ? (
                        <Chip size="sm" mono>
                          {pricingLabel}
                        </Chip>
                      ) : null}
                    </View>
                    {c.category_bio ? (
                      <AppText className="text-body text-body-sm mt-2 leading-5">
                        {c.category_bio}
                      </AppText>
                    ) : null}
                    {c.category_radius_km && c.category_radius_km > 0 ? (
                      <View className="mt-2 flex-row items-center gap-1">
                        <MapPin
                          size={12}
                          strokeWidth={1.75}
                          color="currentColor"
                          className="text-mute"
                        />
                        <AppText weight="mono" className="text-mute text-mono-caption">
                          Радиус выезда: {c.category_radius_km} км
                        </AppText>
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Услуги + прайс */}
        {masterId ? (
          <View className="px-5 mt-8">
            <AppText weight="semibold" className="text-ink text-title-md mb-3">
              Услуги
            </AppText>
            <MasterServicesList masterId={masterId} />
          </View>
        ) : null}

        {/* Портфолио */}
        {portfolio.data && portfolio.data.length > 0 ? (
          <View className="px-5 mt-8">
            <AppText weight="semibold" className="text-ink text-title-md mb-3">
              Портфолио
            </AppText>
            <PortfolioGrid
              items={portfolio.data}
              onOpen={(item) =>
                setLightboxIndex(portfolio.data?.findIndex((p) => p.id === item.id) ?? null)
              }
            />
          </View>
        ) : null}

        {/* Отзывы — ReviewsSection сам рисует свой заголовок и empty-state */}
        {masterId ? (
          <ReviewsSection
            title="Отзывы клиентов"
            emptyText="Пока нет отзывов"
            query={reviews}
          />
        ) : null}

        {/* Wrench-иконка как разделитель — Vercel character */}
        <View className="items-center mt-12 mb-2">
          <Wrench size={20} strokeWidth={1.5} color="currentColor" className="text-mute" />
        </View>
      </ScrollView>

      {/* Sticky bottom CTA — только не свой профиль */}
      {!isOwnProfile && (
        <View
          className="absolute left-0 right-0 bottom-0 bg-canvas border-t border-hairline"
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: insets.bottom + 10,
          }}
        >
          <Button size="lg" fullWidth onPress={handleContact}>
            {isAnon ? "Войти и написать" : "Написать в чат"}
          </Button>
        </View>
      )}

      {/* Portfolio lightbox */}
      {portfolio.data ? (
        <PortfolioLightbox
          items={portfolio.data}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}

      {/* Report modal */}
      {!isOwnProfile && masterId ? (
        <ReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="user"
          targetId={masterId}
        />
      ) : null}
    </View>
  );
}
