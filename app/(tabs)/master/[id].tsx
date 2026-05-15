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
import {
  Building2,
  ChevronLeft,
  Flag,
  MapPin,
  Star,
  Users,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, Button, Card, Skeleton, normalizeAvatarUrl } from "@/components/ui";

// PRICING_MODE_LABELS убран 2026-05-15 (P0-1 в research/MASTER_ACCOUNT_PLAN.md).
// Цены — единственным источником master_services, отображаются через
// <MasterServicesList />. Поле master_categories.pricing_mode помечено
// DEPRECATED в миграции 0055.

import { useAuthSession } from "@/features/auth/use-auth-session";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { useSafeBack } from "@/lib/use-safe-back";
import { MasterServicesList } from "@/features/master-services/MasterServicesList";
import { ReviewsSection } from "@/features/master-view/ReviewsSection";
import {
  useMasterCategoriesPublic,
  useMasterPhone,
  useMasterPublicProfile,
  useReviewsForTarget,
} from "@/features/master-view/use-master-public";
import { PortfolioGrid } from "@/features/profile/PortfolioGrid";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import { type PortfolioItem, useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_LABELS,
  effectiveStatus,
  isAvailabilityVisible,
} from "@/features/master-view/availability";
import { ConfirmWorkSheet } from "@/features/master-view/ConfirmWorkSheet";
import { ReportModal } from "@/features/reports/ReportModal";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import {
  pluralizeClosedDeals,
  pluralizeReviews,
  pluralizeYears,
} from "@/lib/pluralize";

const HERO_RATIO = 16 / 9;
const PORTFOLIO_RATIO = 4 / 5; // Wildberries-style: вертикальный товар, height = width * 5/4

export default function MasterPublicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const masterId = typeof params.id === "string" ? params.id : null;

  const { session } = useAuthSession();
  const currentUserId = session?.user?.id;
  const isOwnProfile = !!masterId && masterId === currentUserId;
  const isAnon = !currentUserId;

  // safeBack: при заходе по deeplink/refresh стек пуст — уходим на home,
  // а не в браузерную историю до приложения.
  const goBack = useSafeBack("/" as const);

  const profile = useMasterPublicProfile(masterId);
  const categories = useMasterCategoriesPublic(masterId);
  const portfolio = useMasterPortfolio(masterId);
  const reviews = useReviewsForTarget(masterId, "client_to_master");
  const masterPhone = useMasterPhone(masterId);
  const refresh = usePullToRefresh();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmWorkOpen, setConfirmWorkOpen] = useState(false);

  const u = profile.data?.user;
  const m = profile.data?.master;
  const fullName =
    [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "Мастер";
  const cityName = profile.data?.city?.name ?? null;
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
  const phoneWa = phoneTel?.replace(/^\+/, "") ?? null; // "79991234567"

  const handleCall = () => {
    if (phoneTel) {
      Linking.openURL(`tel:${phoneTel}`);
    } else {
      handleContact();
    }
  };

  const handleWhatsApp = () => {
    if (phoneWa) {
      Linking.openURL(`https://wa.me/${phoneWa}`);
    } else {
      handleContact();
    }
  };

  const handleContact = () => {
    if (isAnon) {
      router.push("/(auth)/phone" as never);
      return;
    }
    if (masterId) router.push(`/orders/new?master_id=${masterId}` as never);
  };

  // Полностью пустой error-state показываем только если запрос завершился ошибкой
  // или дал null. Пока profile.isLoading — рендерим обычный layout, но с
  // skeleton-формами в hero/имени/чипсах (progressive cascade): пользователь
  // сразу видит структуру, а не белый экран с лоадером.
  if (!profile.isLoading && (profile.error || !profile.data)) {
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
            Это даёт progressive cascade: пользователь сразу видит структуру
            экрана + контролы, контент проявляется секциями сверху вниз. */}
        {portfolio.isLoading || profile.isLoading ? (
          <View style={{ position: "relative" }}>
            <Skeleton
              width="100%"
              style={{ aspectRatio: PORTFOLIO_RATIO }}
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
                <ChevronLeft size={20} strokeWidth={2} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : portfolio.data && portfolio.data.length > 0 ? (
          <View style={{ position: "relative" }}>
            <PortfolioPager
              items={portfolio.data}
              onOpen={(idx) => setLightboxIndex(idx)}
            />
            {/* Gradient overlay для читаемости иконок */}
            <LinearGradient
              colors={["rgba(0,0,0,0.4)", "transparent"]}
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80 }}
              pointerEvents="none"
            />
            {/* Back + Flag */}
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
                <ChevronLeft size={20} strokeWidth={2} color="#fff" />
              </Pressable>
              {!isOwnProfile && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Пожаловаться"
                  onPress={() => setReportOpen(true)}
                  className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
                >
                  <Flag size={18} strokeWidth={1.75} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
        ) : (
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
                source={{ uri: normalizeAvatarUrl(u.avatar_url) ?? u.avatar_url }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
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
                <ChevronLeft size={20} strokeWidth={2} color="#fff" />
              </Pressable>
              {!isOwnProfile && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Пожаловаться"
                  onPress={() => setReportOpen(true)}
                  className="h-9 w-9 items-center justify-center rounded-full bg-black/50 active:opacity-70"
                >
                  <Flag size={18} strokeWidth={1.75} color="#fff" />
                </Pressable>
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
                    <Star size={14} strokeWidth={2} color="currentColor" className="text-ink" />
                    <AppText weight="mono" className="text-ink text-mono-body">
                      {ratingAvg.toFixed(1)}
                    </AppText>
                    <AppText weight="mono" className="text-mute text-mono-body">
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
              </View>

              {/* Row 2: опыт · радиус · бригада/компания (inline через bullets
                  у text-mute) */}
              {(experienceYears !== null && experienceYears > 0) ||
              (m.service_radius_km && m.service_radius_km > 0) ||
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

                  {m.service_radius_km && m.service_radius_km > 0 ? (
                    <>
                      <View className="h-1 w-1 rounded-full bg-mute opacity-40" />
                      <View className="flex-row items-center gap-1">
                        <MapPin size={13} strokeWidth={1.75} color="currentColor" className="text-mute" />
                        <AppText className="text-body text-body-sm">
                          Радиус {m.service_radius_km} км
                        </AppText>
                      </View>
                    </>
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
                        <Users size={13} strokeWidth={1.75} color="currentColor" className="text-mute" />
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
                        <Building2 size={13} strokeWidth={1.75} color="currentColor" className="text-mute" />
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Позвонить"
                onPress={handleCall}
                className="flex-1 items-center justify-center h-10 rounded-full bg-canvas-soft active:bg-canvas-soft-2"
              >
                <AppText weight="medium" className="text-body-sm text-ink">
                  Позвонить
                </AppText>
              </Pressable>
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
                 Card-soft стиле через MasterServicesList. */}
        {(() => {
          const cats = (categories.data ?? []).filter((c) => !!c.category_bio);
          const hasCats = cats.length > 0;
          if (!hasCats && !masterId) return null;
          return (
            <View className="px-5 mt-8">
              <AppText weight="semibold" className="text-ink text-title-md mb-4">
                Услуги
              </AppText>

              {hasCats ? (
                <View className="gap-3">
                  {cats.map((c) => {
                    const name = c.l2?.name_ru ?? c.l2_id;
                    // Цветная иконка категории через единый mapping
                    // `getCategoryColorIconUrl` (см. docs/ICONS.md). Если нет
                    // в маппинге — fallback на круг с canvas-soft фоном без
                    // иконки (не показываем абстрактный glass-pattern).
                    const colorUrl = getCategoryColorIconUrl(c.l2_id);
                    return (
                      <Card key={c.l2_id} variant="soft" padding="md">
                        <View className="flex-row items-center gap-2">
                          {colorUrl ? (
                            <View className="h-8 w-8 items-center justify-center rounded-full bg-canvas">
                              <Image
                                source={{ uri: colorUrl }}
                                style={{ width: 20, height: 20 }}
                              />
                            </View>
                          ) : null}
                          <AppText
                            weight="semibold"
                            className="text-ink text-body-md"
                          >
                            {name}
                          </AppText>
                        </View>
                        <AppText className="text-body text-body-sm mt-2 leading-5">
                          {c.category_bio}
                        </AppText>
                      </Card>
                    );
                  })}
                </View>
              ) : null}

              {masterId ? (
                <View className={hasCats ? "mt-3" : ""}>
                  <MasterServicesList masterId={masterId} hideTitle />
                </View>
              ) : null}
            </View>
          );
        })()}

        {/* Портфолио grid вынесен в hero-pager выше (Wildberries-style 4:5).
            Lightbox по тапу всё ещё открывается через onOpen(index). */}

        {/* Отзывы — ReviewsSection сам рисует свой заголовок и empty-state */}
        {masterId ? (
          <ReviewsSection
            title="Отзывы клиентов"
            emptyText="Пока нет отзывов"
            query={reviews}
          />
        ) : null}

        {/* «Этот мастер выполнил работу» — ghost-text-link в самом низу.
            Это edge-case (ad-hoc подтверждение оффлайн-работы вне платформы),
            не должен конкурировать с primary actions сверху. Поэтому
            inline-ссылка mute-цвета без бордера, под reviews. */}
        {!isOwnProfile ? (
          <View className="items-center mt-8 px-6">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Этот мастер выполнил мне работу"
              onPress={() => setConfirmWorkOpen(true)}
              hitSlop={8}
              className="active:opacity-60"
            >
              <AppText
                weight="medium"
                className="text-caption text-mute underline"
              >
                Этот мастер выполнил мне работу
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {/* Wrench-иконка как разделитель — Vercel character */}
        <View className="items-center mt-12 mb-2">
          <Wrench size={20} strokeWidth={1.5} color="currentColor" className="text-mute" />
        </View>
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

      {/* Report modal */}
      {!isOwnProfile && masterId ? (
        <ReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="user"
          targetId={masterId}
        />
      ) : null}

      {/* Confirm work — sheet с формой ad-hoc подтверждения работы */}
      {!isOwnProfile && masterId ? (
        <ConfirmWorkSheet
          open={confirmWorkOpen}
          onClose={() => setConfirmWorkOpen(false)}
          masterId={masterId}
          masterName={fullName}
        />
      ) : null}
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
  const { width: screenWidth } = useWindowDimensions();
  // Ширина контейнера — на web с max-width:480 контейнер уже screenWidth,
  // поэтому индекс по screenWidth был неверным (фидбэк user 2026-05-14:
  // dot не обновлялся при свайпе на web). Меряем фактическую ширину через
  // onLayout и считаем индекс относительно неё.
  const [containerWidth, setContainerWidth] = useState(screenWidth);
  const [index, setIndex] = useState(0);
  const heroHeight = containerWidth / PORTFOLIO_RATIO; // 4:5 → height = width * 5/4

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
      style={{ width: "100%", height: heroHeight, backgroundColor: "#1a1a1a" }}
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
        renderItem={({ item, index: i }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Фото ${i + 1} из ${items.length}`}
            onPress={() => onOpen(i)}
            style={{ width: containerWidth, height: heroHeight }}
          >
            <Image
              source={{ uri: item.url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
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
