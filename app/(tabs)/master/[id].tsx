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
 *   - Контакт-кнопки «Позвонить» + «WhatsApp» (только если не свой профиль).
 *     In-app чата нет — модель доски объявлений, прямой контакт по телефону.
 *
 * Анон-friendly: контакт-кнопки открывают LoginWall на тапе если userId == null.
 */

import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BookmarkSimple,
  Buildings,
  CaretLeft,
  DotsThreeVertical,
  Flag,
  Star,
  Users,
} from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, BottomSheet, Button, normalizeAvatarUrl, Skeleton } from "@/components/ui";
import { openExternalUrl } from "@/lib/open-link";
import { useAppWidth } from "@/lib/use-app-width";

// PRICING_MODE_LABELS убран 2026-05-15 (P0-1 в research/MASTER_ACCOUNT_PLAN.md).
// Цены — единственным источником master_services, отображаются через
// <MasterServicesList />. Поле master_categories.pricing_mode помечено
// DEPRECATED в миграции 0055.

import { useAuthSession } from "@/features/auth/use-auth-session";
import { useIsFavorite, useToggleFavorite } from "@/features/favorites/use-favorites";
import { MasterServicesList } from "@/features/master-services/MasterServicesList";
import { useMasterServices } from "@/features/master-services/use-master-services";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_LABELS,
  effectiveStatus,
  isAvailabilityVisible,
} from "@/features/master-view/availability";
import { ReviewsSection } from "@/features/master-view/ReviewsSection";
import {
  type ReviewWithAuthor,
  useMasterCategoriesPublic,
  useMasterPhone,
  useMasterPublicProfile,
  useReviewsForTarget,
} from "@/features/master-view/use-master-public";
import { useRecordMasterView } from "@/features/master-view/use-record-view";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import { type PortfolioItem, useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { type CaseWithPreview, useMasterCases } from "@/features/profile/use-portfolio-cases";
import { ReportModal } from "@/features/reports/ReportModal";
import { MasterReviewSheet } from "@/features/reviews/MasterReviewSheet";
import { ReportReviewSheet } from "@/features/reviews/ReportReviewSheet";
import { useMyRecentReviewForMaster } from "@/features/reviews/use-reviews";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import { pluralizeClosedDeals, pluralizeReviews, pluralizeYears } from "@/lib/pluralize";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";
import { resolveWhatsappDigits } from "@/lib/whatsapp";

const HERO_RATIO = 16 / 9;
const PORTFOLIO_RATIO = 4 / 5; // Wildberries-style: вертикальный товар, height = width * 5/4

export default function MasterPublicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const masterId = typeof params.id === "string" ? params.id : null;
  const viewportWidth = useAppWidth();
  // Desktop hero не должен растягиваться до 1400px — на широком экране это
  // вытесняет всё ниже фолда. Lazyweb-паттерн (Airbnb/Booking listing detail)
  // — landscape 16:9 с потолком 520px. Mobile сохраняет портретные 4:5.
  const isDesktopHero = viewportWidth >= 768;
  const heroAspect = isDesktopHero ? 16 / 9 : PORTFOLIO_RATIO;

  const { session } = useAuthSession();
  const currentUserId = session?.user?.id;
  const isOwnProfile = !!masterId && masterId === currentUserId;
  const isAnon = !currentUserId;

  // safeBack: при заходе по deeplink/refresh стек пуст — уходим на home,
  // а не в браузерную историю до приложения.
  const goBack = useSafeBack("/" as const);

  // Telemetry: profile_open при заходе на /master/[id]. RPC сам игнорирует
  // self-views (auth.uid()==master_id) и дедупит за 24h по session_id.
  const recordView = useRecordMasterView();
  useEffect(() => {
    if (masterId) recordView(masterId, "profile_open");
  }, [masterId, recordView]);

  const profile = useMasterPublicProfile(masterId);
  const categories = useMasterCategoriesPublic(masterId);
  const portfolio = useMasterPortfolio(masterId);
  const reviews = useReviewsForTarget(masterId, "client_to_master");
  const masterPhone = useMasterPhone(masterId);
  // Подтягиваем services здесь, чтобы решать видимость секции «Услуги»
  // на верхнем уровне: если у мастера нет ни одной услуги И ни одной
  // категории с bio — заголовок «Услуги» не должен висеть пустым.
  const masterServices = useMasterServices(masterId);
  const refresh = usePullToRefresh();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  // Отзыв, который мастер обжалует (#163). null → шит закрыт.
  const [reportReview, setReportReview] = useState<ReviewWithAuthor | null>(null);

  // CTA «Оставить отзыв». Кнопка видна всем (кроме владельца профиля и тех,
  // кто уже оставил отзыв за последние 30 дней). Аноним по тапу сначала идёт
  // на вход — после авторизации вернётся на профиль и сможет оставить отзыв
  // (правильная логика входа, решение владельца 2026-05-27). Лимит 1/30 дней
  // проверяется на бэке через RPC submit_master_review.
  const recentReview = useMyRecentReviewForMaster(masterId ?? undefined, currentUserId);
  const showReviewCta = !!masterId && !isOwnProfile && !recentReview.data;

  // Тап «Оставить отзыв»: аноним → на вход; авторизованный → форма отзыва.
  const handleReviewPress = () => {
    if (!currentUserId) {
      router.push("/(auth)/phone" as never);
      return;
    }
    setReviewSheetOpen(true);
  };
  // Safari-fallback: если avatar_url hero не загрузился (CORS / 404) —
  // переключаемся на инициалы через Avatar xl. Иначе пользователь
  // видит пустой серый блок 16:9. State объявлен здесь, reset-effect — ниже,
  // после получения `u?.avatar_url` из profile.data.
  const [heroFailed, setHeroFailed] = useState(false);

  const tc = useThemeColors(["ink", "error", "accent", "on-dark"]);

  // Избранное. Для гостя/own-profile кнопка скрыта (rendering ниже).
  const isFavorite = useIsFavorite(!isAnon && !isOwnProfile ? (masterId ?? undefined) : undefined);
  const toggleFavorite = useToggleFavorite();
  const handleToggleFavorite = () => {
    if (!masterId || isAnon || isOwnProfile) return;
    toggleFavorite.mutate({ masterId, nextValue: !isFavorite.data });
  };

  const u = profile.data?.user;
  const m = profile.data?.master;
  // Reset hero-fallback при смене avatar_url, чтобы новая попытка
  // загрузки не была заблокирована предыдущей ошибкой.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependency is an intentional reset trigger; the value is not read inside the effect
  useEffect(() => {
    setHeroFailed(false);
  }, [u?.avatar_url]);
  const fullName = [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "Мастер";
  const ratingAvg = m?.rating_overall_avg ?? null;
  const ratingCount = m?.rating_overall_count ?? 0;
  const closedDeals = m?.closed_deals ?? 0;
  const experienceYears = m?.experience_years ?? null;

  // Прямые контакты — без обязательной авторизации.
  // Phone приходит через RPC get_master_phone (миграция 0040) — обходит RLS
  // на users (phone живёт в auth.users), но фильтрует только активных мастеров.
  // Если phone null (мастер новый, без auth.phone) — fallback на orders/new.
  const phoneRaw = masterPhone.data ?? null;
  const phoneTel = phoneRaw?.replace(/[^\d+]/g, "") ?? null; // "+79991234567"

  // Sprint 0079: WhatsApp — отдельный номер ИЛИ совпадает с основным, либо
  // не указан. Если null — кнопка WhatsApp не отображается.
  const phoneWa = resolveWhatsappDigits({
    whatsappPhone: m?.whatsapp_phone,
    whatsappSameAsPhone: m?.whatsapp_same_as_phone,
    masterPhone: phoneRaw,
  });

  // 2026-05-20 «classifieds»: убран fallback на in-app форму («Написать в xtrud»).
  // Если у мастера нет phone — кнопка просто неактивна, чтобы не сбивать с
  // прямого контакта на /orders/new.
  const handleCall = () => {
    if (phoneTel) {
      openExternalUrl(`tel:${phoneTel}`);
    }
  };

  const handleWhatsApp = () => {
    if (phoneWa) {
      openExternalUrl(`https://wa.me/${phoneWa}`);
    }
  };

  // Цельный skeleton всей страницы пока грузятся основные данные (профиль +
  // портфолио). Раньше был «progressive cascade»: layout рендерился сразу,
  // кнопка «Позвонить» и TabBar появлялись раньше hero/имени/bio — выглядело
  // рвано (фидбэк владельца 2026-05-27: «что-то прогружено, что-то белое»).
  // Теперь: открыл → видишь скелет всей структуры → потом весь контент разом.
  if (profile.isLoading || portfolio.isLoading) {
    return (
      <MasterProfileSkeleton
        insets={insets}
        goBack={goBack}
        heroStyle={
          isDesktopHero
            ? { height: Math.min((viewportWidth * 9) / 16, 520) }
            : { aspectRatio: heroAspect }
        }
      />
    );
  }

  // Полностью пустой error-state показываем только если запрос завершился ошибкой
  // или дал null.
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
          <Button onPress={goBack}>Назад</Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        {/* HERO — приоритет:
              1. portfolio загружается или profile загружается → skeleton 4:5
              2. есть фото → swipeable галерея 4:5 (Wildberries-style)
              3. fallback на 16:9 аватар.
            Back и overflow (⋮) — overlay-кнопки поверх hero (фидбэк user
            2026-05-15: «верни как было — overlay, не отдельный canvas-header»).
            Flag заменён на DotsThreeVertical → BottomSheet с «Пожаловаться». */}
        {portfolio.isLoading || profile.isLoading ? (
          <View style={{ position: "relative" }}>
            <Skeleton
              width="100%"
              style={
                isDesktopHero
                  ? { height: Math.min((viewportWidth * 9) / 16, 520) }
                  : { aspectRatio: heroAspect }
              }
            />
            {/* Back button оставляем активным даже на skeleton — пользователь
                должен иметь возможность уйти, если передумал ждать. */}
            <View
              className="absolute left-0 right-0 flex-row items-center justify-between px-4"
              style={{ top: insets.top + 8 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Назад"
                onPress={goBack}
                className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
              >
                <CaretLeft size={20} weight="bold" color={tc["on-dark"]} />
              </Pressable>
            </View>
          </View>
        ) : portfolio.data && portfolio.data.length > 0 ? (
          <View style={{ position: "relative" }}>
            <PortfolioPager items={portfolio.data} onOpen={(idx) => setLightboxIndex(idx)} />
            {/* Gradient overlay для читаемости иконок */}
            <LinearGradient
              colors={["rgba(0,0,0,0.4)", "transparent"]}
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80 }}
              pointerEvents="none"
            />
            {/* Back + Overflow (⋮) */}
            <View
              className="absolute left-0 right-0 flex-row items-center justify-between px-4"
              style={{ top: insets.top + 8 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Назад"
                onPress={goBack}
                className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
              >
                <CaretLeft size={20} weight="bold" color={tc["on-dark"]} />
              </Pressable>
              {!isOwnProfile && (
                <View className="flex-row items-center gap-2">
                  {!isAnon ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isFavorite.data ? "Убрать из закладок" : "В закладки"}
                      onPress={handleToggleFavorite}
                      disabled={toggleFavorite.isPending}
                      className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
                    >
                      <BookmarkSimple
                        size={20}
                        weight={isFavorite.data ? "fill" : "bold"}
                        color={tc["on-dark"]}
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Действия"
                    onPress={() => setActionMenuOpen(true)}
                    className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
                  >
                    <DotsThreeVertical size={20} weight="bold" color={tc["on-dark"]} />
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View
            style={{
              width: "100%",
              aspectRatio: HERO_RATIO,
              position: "relative",
            }}
            className="bg-canvas-soft-2"
          >
            {normalizeAvatarUrl(u?.avatar_url) && !heroFailed ? (
              <Image
                source={{ uri: normalizeAvatarUrl(u?.avatar_url) as string }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                onError={() => setHeroFailed(true)}
              />
            ) : (
              <View className="flex-1 items-center justify-center bg-canvas-soft-2">
                <Avatar name={fullName} seed={masterId} size="xl" />
              </View>
            )}
            <LinearGradient
              colors={["rgba(0,0,0,0.4)", "transparent"]}
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80 }}
              pointerEvents="none"
            />
            <View
              className="absolute left-0 right-0 flex-row items-center justify-between px-4"
              style={{ top: insets.top + 8 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Назад"
                onPress={goBack}
                className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
              >
                <CaretLeft size={20} weight="bold" color={tc["on-dark"]} />
              </Pressable>
              {!isOwnProfile && (
                <View className="flex-row items-center gap-2">
                  {!isAnon ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isFavorite.data ? "Убрать из закладок" : "В закладки"}
                      onPress={handleToggleFavorite}
                      disabled={toggleFavorite.isPending}
                      className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
                    >
                      <BookmarkSimple
                        size={20}
                        weight={isFavorite.data ? "fill" : "bold"}
                        color={tc["on-dark"]}
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Действия"
                    onPress={() => setActionMenuOpen(true)}
                    className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
                  >
                    <DotsThreeVertical size={20} weight="bold" color={tc["on-dark"]} />
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Trust-row + имя — Avatar md слева от имени (фидбэк user 2026-05-14).
            Hero-фото сверху — это «портфолио»/работы мастера, а аватар рядом
            с именем нужен как persona-signal (как Airbnb host card / Booking
            agent name + photo). Раньше имя шло одиноким display-md заголовком
            без визуального якоря. */}
        <View className="px-5 mt-4">
          {u ? (
            <View className="flex-row items-center gap-3">
              <Avatar
                url={u.avatar_url ?? null}
                name={fullName}
                seed={u.id ?? masterId}
                size="md"
              />
              <AppText
                weight="display"
                className="flex-1 text-display-md tracking-tight text-ink"
                numberOfLines={2}
              >
                {fullName}
              </AppText>
            </View>
          ) : (
            // Skeleton: avatar-круг 44 + имя 220×28 — повторяет финальный
            // layout, чтобы при появлении данных не было layout-shift.
            <View className="flex-row items-center gap-3">
              <Skeleton height={44} width={44} className="rounded-full" />
              <Skeleton height={28} width={180} className="rounded" />
            </View>
          )}

          {/* Trust-info — 2 строки inline-meta (Airbnb / Booking master profile
              pattern). Раньше всё в одну строку из 7 chips → выглядело
              «сплющенным» (фидбэк user 2026-05-14). Теперь:
                Row 1: статус-pill (если есть) + ★ рейтинг + 📍 город
                Row 2: 14 лет опыта · Радиус 16 км · Бригада 4 чел.
              Размер text-body-sm (14px), iconы 14px — крупнее и читабельнее
              чем chip h-7 / text-caption-xs (10px). */}
          {!m ? (
            <View className="mt-4 gap-2">
              <Skeleton height={20} width={260} className="rounded" />
              <Skeleton height={16} width={220} className="rounded" />
            </View>
          ) : (
            <View className="mt-4 gap-2">
              {/* Row 1: статус + рейтинг + город */}
              <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
                {(() => {
                  const status = effectiveStatus(
                    m.availability_status ?? null,
                    m.availability_until ?? null,
                  );
                  if (!isAvailabilityVisible(status)) return null;
                  return (
                    <View
                      className="flex-row items-center gap-1.5 h-7 px-3 rounded-full"
                      style={{ backgroundColor: `${AVAILABILITY_DOT[status]}22` }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: AVAILABILITY_DOT[status],
                        }}
                      />
                      <AppText
                        weight="semibold"
                        className="text-caption"
                        style={{ color: AVAILABILITY_DOT[status] }}
                      >
                        {AVAILABILITY_LABELS[status]}
                      </AppText>
                    </View>
                  );
                })()}

                {ratingAvg !== null && ratingCount > 0 ? (
                  <View className="flex-row items-center gap-1">
                    <Star size={14} weight="bold" color="currentColor" className="text-ink" />
                    <AppText weight="mono" className="text-ink text-mono-body">
                      {ratingAvg.toFixed(1)}
                    </AppText>
                    <AppText weight="mono" className="text-mute text-mono-body">
                      ({pluralizeReviews(ratingCount)})
                    </AppText>
                  </View>
                ) : null}

                {/* Город мастера НЕ показываем (2026-05-16) — где он работает,
                    видно в секции «Где работаете» (master_service_areas). */}
              </View>

              {/* Row 2: опыт · бригада/компания (inline через bullets у text-mute).
                  Радиус выезда удалён 2026-05-15 — заменено на ServiceAreas
                  (m2m мастер ↔ город/район), отображается ниже отдельной секцией. */}
              {(experienceYears !== null && experienceYears > 0) ||
              closedDeals > 0 ||
              m.account_type === "brigade" ||
              m.account_type === "company" ? (
                <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
                  {experienceYears !== null && experienceYears > 0 ? (
                    <View className="flex-row items-center gap-1">
                      <AppText className="text-body text-body-sm">
                        {pluralizeYears(experienceYears)} опыта
                      </AppText>
                    </View>
                  ) : null}

                  {closedDeals > 0 ? (
                    <>
                      <View className="h-1 w-1 rounded-full bg-mute opacity-40" />
                      <AppText className="text-body text-body-sm">
                        {pluralizeClosedDeals(closedDeals)}
                      </AppText>
                    </>
                  ) : null}

                  {m.account_type === "brigade" ? (
                    <>
                      <View className="h-1 w-1 rounded-full bg-mute opacity-40" />
                      <View className="flex-row items-center gap-1">
                        <Users size={13} weight="bold" color="currentColor" className="text-mute" />
                        <AppText className="text-body text-body-sm">
                          Бригада{m.team_size && m.team_size > 1 ? ` ${m.team_size} чел.` : ""}
                        </AppText>
                      </View>
                    </>
                  ) : null}
                  {m.account_type === "company" ? (
                    <>
                      <View className="h-1 w-1 rounded-full bg-mute opacity-40" />
                      <View className="flex-row items-center gap-1">
                        <Buildings
                          size={13}
                          weight="bold"
                          color="currentColor"
                          className="text-mute"
                        />
                        <AppText className="text-body text-body-sm">Компания</AppText>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}

          {/* Bio */}
          {m?.bio ? (
            <AppText className="text-body text-body-md mt-4 leading-6">{m.bio}</AppText>
          ) : null}

          {/* Inline contact actions — ghost equal-weight pills, единый стиль
              с category page MasterRow (фидбэк user 2026-05-14: «кнопки
              делаем как там, на всём сайте»). bg-canvas-soft + h-10 + medium
              + без иконок (text-only) — minimal-shadcn-pattern. */}
          {!isOwnProfile && (
            <View className="flex-row gap-2 mt-5">
              {/* «Позвонить» — primary-действие, фирменный акцент (bg-accent-soft
                  + text-accent), как активный таб в нижнем меню (решение
                  владельца 2026-05-27). WhatsApp ниже остаётся secondary-серым,
                  чтобы был один акцентный primary. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Позвонить"
                onPress={handleCall}
                className="flex-1 items-center justify-center h-10 rounded-full bg-accent-soft active:opacity-80"
              >
                <AppText weight="semibold" className="text-body-sm text-accent">
                  Позвонить
                </AppText>
              </Pressable>
              {/* Sprint 0079: кнопка WhatsApp только если у мастера указан
                  WhatsApp (явный номер или same_as_phone=true). Иначе
                  скрываем — клиент не видит «пустую» кнопку. */}
              {phoneWa ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Написать в WhatsApp"
                  onPress={handleWhatsApp}
                  className="flex-1 items-center justify-center h-10 rounded-full bg-canvas-soft active:bg-canvas-soft-2"
                >
                  <AppText weight="medium" className="text-body-sm text-ink">
                    WhatsApp
                  </AppText>
                </Pressable>
              ) : null}
              {/* Закладка — компактная квадратная кнопка рядом с контактами.
                  Только для авторизованных (закладка требует аккаунта). В
                  избранном — акцентная заливка. Дублирует кнопку из hero-overlay,
                  но здесь она нагляднее в потоке (фидбэк владельца 2026-05-27). */}
              {!isAnon ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isFavorite.data ? "Убрать из закладок" : "В закладки"}
                  onPress={handleToggleFavorite}
                  disabled={toggleFavorite.isPending}
                  className="items-center justify-center h-10 w-12 rounded-full bg-canvas-soft active:bg-canvas-soft-2"
                >
                  <BookmarkSimple
                    size={18}
                    weight={isFavorite.data ? "fill" : "bold"}
                    color={isFavorite.data ? tc.accent : tc.ink}
                  />
                </Pressable>
              ) : null}
            </View>
          )}

          {/* «Этот мастер выполнил работу» CTA убран отсюда — был слишком
              видный сразу после Позвонить/WhatsApp, отвлекал на edge-case
              (ad-hoc подтверждение оффлайн-работы). Перенесён в самый низ
              экрана как ghost-text-link перед wrench-разделителем (по
              фидбэку user 2026-05-14). */}
        </View>

        {/* Секция «Услуги» — единый блок без визуальной путаницы. Состоит из:
              1. Направления (категории с непустым описанием bio) — Card-soft
                 со списком «что делаю + как работаю». Категории БЕЗ bio не
                 показываем, чтобы не было «пустых» карточек разного стиля
                 (фидбэк user 2026-05-14).
              2. Прайс (master_services) — карточки с ценами в том же
                 Card-soft стиле через MasterServicesList.
              Скрываем целиком, если у мастера нет ни одной категории с bio
              И нет ни одной услуги (фидбэк user 2026-05-20: «то, что не
              нужно — убрать»). Заголовок без контента — анти-паттерн. */}
        {(() => {
          const cats = (categories.data ?? []).filter((c) => !!c.category_bio);
          const hasCats = cats.length > 0;
          const hasServices = (masterServices.data?.length ?? 0) > 0;
          // Пока хоть один из источников грузится — рисуем секцию-skeleton
          // через MasterServicesList (он сам рисует Skeleton-ряды). Иначе
          // при «холодном старте» секция мигнёт пропаданием.
          const isLoading = categories.isLoading || masterServices.isLoading;
          if (!hasCats && !hasServices && !isLoading) return null;
          if (!masterId) return null;
          return (
            <View className="px-5 mt-8">
              <AppText weight="semibold" className="text-ink text-title-md mb-4">
                Услуги
              </AppText>

              {/* Направления — inline-rows без card-обёрток. icon + name + bio
                  на одной строке + 2-line description под ним. Меньше воздуха,
                  читаемо. (Lazyweb / TaskRabbit pattern — direct rows). */}
              {hasCats ? (
                <View className="mb-3">
                  {cats.map((c, idx) => {
                    const name = c.l2?.name_ru ?? c.l2_id;
                    const colorUrl = getCategoryColorIconUrl(c.l2_id);
                    return (
                      <View key={c.l2_id} className={`flex-row gap-3 ${idx > 0 ? "mt-3" : ""}`}>
                        {colorUrl ? (
                          <View className="h-6 w-6 items-center justify-center mt-0.5">
                            <Image source={{ uri: colorUrl }} style={{ width: 20, height: 20 }} />
                          </View>
                        ) : null}
                        <View className="flex-1">
                          <AppText weight="semibold" className="text-ink text-body-md">
                            {name}
                          </AppText>
                          <AppText
                            className="mt-0.5 text-body text-body-sm leading-5"
                            numberOfLines={2}
                          >
                            {c.category_bio}
                          </AppText>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {masterId ? <MasterServicesList masterId={masterId} hideTitle compact /> : null}
            </View>
          );
        })()}

        {/* Портфолио grid вынесен в hero-pager выше (Wildberries-style 4:5).
            Lightbox по тапу всё ещё открывается через onOpen(index). */}

        {/* «Работы мастера» — список кейсов (portfolio_cases, миграция 0085).
            Preview 2 шт + ghost-link «Смотреть все» (паттерн TaskRabbit/LinkedIn
            view-all). Каждый кейс = cover-фото + title + description + дата. */}
        {masterId ? <MasterCasesPreview masterId={masterId} /> : null}

        {/* Отзывы — скрываем секцию целиком если у мастера 0 отзывов.
            Раньше ReviewsSection рисовал собственный empty-state с серым
            box'ом «Пока нет отзывов» — это противоречит правилу «empty =
            invisible» (фидбэк user 2026-05-20). Когда первая страница ещё
            грузится — рисуем секцию с loading-индикатором ReviewsSection.
            Когда данные пришли и rows.length===0 — секции нет. */}
        {(() => {
          if (!masterId) return null;
          const total = reviews.data?.pages.reduce((sum, p) => sum + p.rows.length, 0) ?? 0;
          if (!reviews.isLoading && total === 0) return null;
          return (
            <ReviewsSection
              title="Отзывы клиентов"
              emptyText="Пока нет отзывов"
              query={reviews}
              // Мастер на СВОЕЙ странице может обжаловать накрученный/
              // оскорбительный отзыв → жалоба уходит модератору (#163).
              onReport={isOwnProfile ? (r) => setReportReview(r) : undefined}
            />
          );
        })()}

        {/* CTA «Оставить отзыв» (freeform-flow 2026-05-27). Кнопка одна и та же
            для всех: аноним по тапу сначала идёт на вход (handleReviewPress),
            авторизованный — открывает форму. Владельцу профиля кнопки нет.
            Если отзыв за 30 дней уже есть — вместо кнопки мягкая info-строка.
            RPC лимитом 1/30 дней страхует на бэке. */}
        {showReviewCta ? (
          <View className="mt-6 px-5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Оставить отзыв"
              onPress={handleReviewPress}
              className="h-12 flex-row items-center justify-center rounded-md border border-hairline bg-canvas active:bg-canvas-soft"
            >
              <AppText weight="semibold" className="text-button text-ink">
                Оставить отзыв
              </AppText>
            </Pressable>
          </View>
        ) : masterId && !isOwnProfile && recentReview.data ? (
          <View className="mt-6 px-5">
            <AppText className="text-center text-caption text-mute">
              Вы уже оставили отзыв этому мастеру. Новый можно будет оставить через 30 дней.
            </AppText>
          </View>
        ) : null}

        {/* «Этот мастер выполнил работу» — перенесён в action menu (⋮ → sheet).
            Это edge-case (ad-hoc подтверждение оффлайн-работы), не должен
            светиться внизу карточки. Wrench-divider убран — Vercel-стиль
            обходится без декоративных разделителей.

            Источник: ⋮ DotsThreeVertical в hero header → BottomSheet «Действия»
            → пункт «Этот мастер выполнил работу» (см. ниже actionMenu). */}
      </ScrollView>

      {/* Sticky CTA убран — кнопки call/WhatsApp перенесены inline после bio. */}

      {/* Portfolio lightbox */}
      {portfolio.data ? (
        <PortfolioLightbox
          items={portfolio.data}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}

      {/* Freeform-отзыв на мастера. Открывается только для авторизованного
          клиента у которого ещё нет отзыва за 30 дней (см. canLeaveReview). */}
      {masterId && currentUserId ? (
        <MasterReviewSheet
          open={reviewSheetOpen}
          onClose={() => setReviewSheetOpen(false)}
          masterId={masterId}
          authorId={currentUserId}
          masterName={fullName ?? "Мастер"}
        />
      ) : null}

      {/* Обжалование отзыва мастером (#163). Открывается из ReviewsSection
          только на своей странице (onReport передаётся при isOwnProfile). */}
      <ReportReviewSheet
        open={reportReview !== null}
        onClose={() => setReportReview(null)}
        review={reportReview}
        reporterId={currentUserId}
      />

      {/* Action menu — overflow ⋮ из header. 2026-05-20 «classifieds»:
          из меню убран пункт «Этот мастер выполнил мне работу» (ad-hoc
          подтверждение оффлайн-работы) — он завязан на lifecycle, которого
          в текущей модели больше нет. Остался только «Пожаловаться». */}
      {!isOwnProfile ? (
        <BottomSheet
          open={actionMenuOpen}
          onClose={() => setActionMenuOpen(false)}
          title="Действия"
        >
          <View className="pb-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setActionMenuOpen(false);
                setReportOpen(true);
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 20,
                paddingVertical: 14,
              })}
            >
              <View className="h-9 w-9 items-center justify-center rounded-md bg-error-soft">
                <Flag size={18} weight="bold" color={tc.error} />
              </View>
              <AppText weight="semibold" className="text-body-md text-error">
                Пожаловаться
              </AppText>
            </Pressable>
          </View>
        </BottomSheet>
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

// ----------------------------------------------------------------------------
// MasterProfileSkeleton — цельный скелет страницы мастера на время загрузки.
// Повторяет структуру: hero (фото) → аватар+имя+опыт → bio → кнопки контакта
// → секция услуг. Показывается пока грузятся profile+portfolio, потом весь
// контент появляется разом (не рвано). См. фидбэк владельца 2026-05-27.
// ----------------------------------------------------------------------------

function MasterProfileSkeleton({
  insets,
  goBack,
  heroStyle,
}: {
  insets: { top: number; bottom: number };
  goBack: () => void;
  heroStyle: { height: number } | { aspectRatio: number };
}) {
  const onDarkColor = useThemeColor("on-dark");

  return (
    <View className="flex-1 bg-canvas">
      {/* Hero-плейсхолдер + активная back-кнопка (уйти можно сразу). */}
      <View style={{ position: "relative" }}>
        <Skeleton width="100%" style={heroStyle} />
        <View
          className="absolute left-0 right-0 flex-row items-center px-4"
          style={{ top: insets.top + 8 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={goBack}
            className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
          >
            <CaretLeft size={20} weight="bold" color={onDarkColor} />
          </Pressable>
        </View>
      </View>

      <View className="px-5 pt-5">
        {/* Аватар + имя + опыт */}
        <View className="flex-row items-center gap-3">
          <Skeleton width={56} height={56} style={{ borderRadius: 28 }} />
          <View className="flex-1">
            <Skeleton width="55%" height={22} style={{ borderRadius: 6 }} />
            <View className="mt-2">
              <Skeleton width="40%" height={14} style={{ borderRadius: 4 }} />
            </View>
          </View>
        </View>

        {/* Bio — 3 строки */}
        <View className="mt-5">
          <Skeleton width="100%" height={14} style={{ borderRadius: 4 }} />
          <View className="mt-2">
            <Skeleton width="94%" height={14} style={{ borderRadius: 4 }} />
          </View>
          <View className="mt-2">
            <Skeleton width="68%" height={14} style={{ borderRadius: 4 }} />
          </View>
        </View>

        {/* Кнопки контакта */}
        <View className="mt-6 flex-row gap-2">
          <View className="flex-1">
            <Skeleton width="100%" height={40} style={{ borderRadius: 999 }} />
          </View>
          <View className="flex-1">
            <Skeleton width="100%" height={40} style={{ borderRadius: 999 }} />
          </View>
        </View>

        {/* Секция «Услуги» */}
        <View className="mt-8">
          <Skeleton width="35%" height={18} style={{ borderRadius: 6 }} />
          <View className="mt-4">
            <Skeleton width="100%" height={52} style={{ borderRadius: 12 }} />
          </View>
          <View className="mt-3">
            <Skeleton width="100%" height={52} style={{ borderRadius: 12 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// PortfolioPager — Wildberries-style hero галерея 4:5 (вертикальные фото).
// Горизонтальный pagingEnabled FlatList + pagination dots внизу. Тап откры-
// вает PortfolioLightbox через onOpen(index).
// ----------------------------------------------------------------------------

function PortfolioPager({
  items,
  onOpen,
}: {
  items: PortfolioItem[];
  onOpen: (index: number) => void;
}) {
  const screenWidth = useAppWidth();
  // Ширина контейнера — на web с max-width:480 контейнер уже screenWidth,
  // поэтому индекс по screenWidth был неверным (фидбэк user 2026-05-14:
  // dot не обновлялся при свайпе на web). Меряем фактическую ширину через
  // onLayout и считаем индекс относительно неё.
  const [containerWidth, setContainerWidth] = useState(screenWidth);
  const [index, setIndex] = useState(0);
  // На desktop (≥ 768) hero не должен расти до 1400px — это огромный блок,
  // вытесняющий всё остальное за фолд. Lazyweb-паттерн (Airbnb/Booking listing
  // detail) — landscape ~16:9, потолок ~520px. На mobile сохраняем 4:5
  // (Wildberries-style), потому что портретный hero лучше для маркетплейс-карточки
  // на узком экране.
  const isDesktop = containerWidth >= 768;
  const heroHeight = isDesktop
    ? Math.min((containerWidth * 9) / 16, 520)
    : containerWidth / PORTFOLIO_RATIO; // 4:5 → height = width * 5/4

  // onScroll + throttle вместо onMomentumScrollEnd. На RN-Web нет настоящего
  // momentum — momentum-event иногда не вызывается, dot-индикатор «зависает»
  // на первой странице. onScroll работает и на web, и на native.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!containerWidth) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    if (i !== index && i >= 0 && i < items.length) setIndex(i);
  };

  return (
    <View
      style={{ width: "100%", height: heroHeight }}
      className="bg-canvas-soft-2"
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        snapToInterval={containerWidth}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        // Ленивый рендер: первое фото рендерится сразу (priority high), остальные
        // — по мере свайпа. Так первый кадр появляется быстро, не конкурируя за
        // канал с 5 другими фото (фидбэк юзера «первая быстрее»).
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        renderItem={({ item, index: i }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Фото ${i + 1} из ${items.length}`}
            onPress={() => onOpen(i)}
            style={{ width: containerWidth, height: heroHeight }}
          >
            <PortfolioPagerImage
              url={item.url}
              width={Math.round(containerWidth) || Math.round(screenWidth)}
              priority={i === 0 ? "high" : "low"}
            />
          </Pressable>
        )}
      />
      {/* Pagination dots — Wildberries-style: активный длиннее, неактивные точки */}
      {items.length > 1 ? (
        <View
          style={{
            position: "absolute",
            bottom: 16,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
          pointerEvents="none"
        >
          {items.map((it, i) => (
            <View
              key={it.id}
              style={{
                width: i === index ? 24 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? "#ffffff" : "rgba(255,255,255,0.5)",
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// PortfolioPagerImage — отдельный компонент с локальным fail-state, чтобы
// ошибка одной картинки не сваливала весь pager. При onError рендерим
// нейтральный canvas-soft-2 фон (стандартный «фото-плейсхолдер» Vercel-style).
// Без этого Safari на CORS-fail оставлял пустоту вместо первого слайда.
function PortfolioPagerImage({
  url,
  width,
  priority = "normal",
}: {
  url: string;
  /** Ширина показа в логических px — для подгонки размера через image-CDN. */
  width: number;
  /** Первое фото карусели — "high" (грузится первым), остальные — "low". */
  priority?: "low" | "normal" | "high";
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <View className="flex-1 bg-canvas-soft-2" />;
  }
  const blur = cdnBlur(url);
  return (
    <ExpoImage
      // Подгоняем под ширину показа + webp + blur-up плейсхолдер (image-cdn).
      source={{ uri: cdnImage(url, { width, quality: 74 }) }}
      placeholder={blur ? { uri: blur } : undefined}
      placeholderContentFit="cover"
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      transition={200}
      priority={priority}
      // Кэш память+диск — повторный заход на мастера показывает фото мгновенно.
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
    />
  );
}

// ============================================================================
// MasterCasesPreview — секция «Работы мастера» на публичной карточке.
//
// Редизайн 2026-05-20 (фидбэк user: «как делают большие компании. Сделать
// офигенно крутой блок»).
//
// Layout: Instagram-style 3-column square grid (на mobile), 4-col на planshet,
// 5-col на desktop. Нулевой gap (1px разделитель через background) — fotos-first
// без шума. До 9 плиток на странице мастера (3×3), всё остальное — за «Все N».
//
// Lazyweb-референсы:
//   - Instagram profile grid (3-col square, нулевые подписи) — главный паттерн.
//   - Behance/Dribbble (fotos-first showcase).
//
// Ключевые правила:
//   1. Кейс БЕЗ обложки в гриде НЕ показывается — никаких placeholder'ов с
//      гаечным ключом. Если у мастера 0 кейсов с фото → секция целиком
//      скрыта (фидбэк user 2026-05-20: «пустые блоки убрать»).
//   2. Подпись (название) рендерится поверх фото снизу полупрозрачным
//      gradient'ом, в одну строку — Airbnb host card pattern.
//   3. Бейдж «+N» в правом верхнем углу если в кейсе больше 1 фото.
//   4. Тап по плитке → /case/[caseId] (публичный read-only viewer).
// ============================================================================

const CASES_PREVIEW_LIMIT = 9; // 3×3 на mobile

function MasterCasesPreview({ masterId }: { masterId: string }) {
  const router = useRouter();
  const cases = useMasterCases(masterId);
  // Берём только кейсы с обложкой (preview_items[0] есть). Если фото не
  // загружено — кейс пока «невидимый» для публичной карточки.
  const visibleCases = (cases.data ?? []).filter((c) => !!c.preview_items[0]?.url);

  // Loading + пустой list → секция скрыта (публичная карточка, никаких
  // «pending» состояний).
  if (cases.isLoading || visibleCases.length === 0) return null;

  const visible = visibleCases.slice(0, CASES_PREVIEW_LIMIT);
  const showSeeAll = visibleCases.length > CASES_PREVIEW_LIMIT;
  const total = visibleCases.length;

  return (
    <View className="mt-8">
      <View className="px-5 flex-row items-center justify-between mb-3">
        <AppText weight="semibold" className="text-ink text-title-md">
          Работы мастера
        </AppText>
        {showSeeAll ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/(tabs)/master-cases/${masterId}` as never)}
            hitSlop={8}
            className="active:opacity-70"
          >
            <AppText weight="medium" className="text-body-sm text-ink underline">
              Все {total}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <CasesGrid
        cases={visible}
        onPress={(caseId) => router.push(`/(tabs)/case/${caseId}` as never)}
      />
    </View>
  );
}

// ----------------------------------------------------------------------------
// CasesGrid — сетка плиток (Instagram-style). Всегда 3 колонки (решение
// владельца 2026-05-27). Раньше была адаптивная (3/4/5 col по viewport)
// — на широком превью получалось 2 неэстетично-крупных плитки на ряд.
// Считаем плитку через flex-basis: `100%/cols - gap`. Gap 2px (минимальный
// разделитель между photo, как в IG).
// ----------------------------------------------------------------------------

const GRID_GAP = 2;
const GRID_COLS = 3;

function CasesGrid({
  cases,
  onPress,
}: {
  cases: CaseWithPreview[];
  onPress: (caseId: string) => void;
}) {
  const viewportWidth = useAppWidth();
  const cols = GRID_COLS;
  // Доступная ширина грида: viewportWidth - 0 (без horizontal padding,
  // плитки идут до краёв как в Instagram). gap*(cols-1) уходит на
  // зазоры между плитками.
  const tileSize = (viewportWidth - GRID_GAP * (cols - 1)) / cols;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: GRID_GAP,
      }}
    >
      {cases.map((c) => (
        <CaseTile key={c.id} data={c} size={tileSize} onPress={() => onPress(c.id)} />
      ))}
    </View>
  );
}

// ----------------------------------------------------------------------------
// CaseTile — квадратная плитка с фото-обложкой, бейджем «+N» и подписью-
// гра­ди­ен­том снизу. Используется только в CasesGrid; preview_items[0]
// гарантирован вышестоящим фильтром.
// ----------------------------------------------------------------------------

function CaseTile({
  data,
  size,
  onPress,
}: {
  data: CaseWithPreview;
  size: number;
  onPress: () => void;
}) {
  const cover = data.preview_items[0];
  const remainingPhotos = data.items_count > 1 ? data.items_count - 1 : 0;
  // Safari-fallback: ошибка одной обложки не должна ломать всю Instagram-grid.
  // При onError остаётся bg-canvas-soft-2 фон (нейтральный плейсхолдер).
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Работа: ${data.title}`}
      onPress={onPress}
      style={{ width: size, height: size, position: "relative" }}
      className="bg-canvas-soft-2 overflow-hidden active:opacity-80"
    >
      {failed || !cover ? null : (
        <Image
          source={{ uri: cdnImage(cover.url, { width: size }) }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}
      {/* Бейдж «+N фото» — правый верхний угол, как у IG carousel-indicator.
          rgba(0,0,0,0.55) — технический цвет overlay'я, не токен (это alpha
          на фото, не текст на фоне; работает одинаково в обеих темах). */}
      {remainingPhotos > 0 ? (
        <View
          className="absolute top-1.5 right-1.5 rounded-full px-2 py-0.5"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <AppText weight="mono" className="text-mono-caption text-white">
            +{remainingPhotos}
          </AppText>
        </View>
      ) : null}
      {/* Подпись поверх фото — gradient снизу для читаемости title.
          Airbnb host-card pattern: photo-first, текст subtle поверх. */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.65)"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55%",
        }}
        pointerEvents="none"
      />
      <View className="absolute left-0 right-0 bottom-0 px-2 pb-2" pointerEvents="none">
        <AppText weight="semibold" className="text-caption text-white" numberOfLines={1}>
          {data.title}
        </AppText>
      </View>
    </Pressable>
  );
}
