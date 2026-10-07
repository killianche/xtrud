/**
 * /master/[id] — публичная страница специалиста.
 *
 * DECISION владельца 2026-09-07 (референс — карточка исполнителя TaskRabbit):
 * имя и рейтинг, чем занимается, о себе и опыт, фото работ, отзывы, и
 * контакты — позвонить или написать в WhatsApp. Всё в стиле iOS 26: строка
 * навигации без фона с круглыми стеклянными кнопками, крупный заголовок,
 * inset grouped блоки, плавающие стеклянные кнопки связи внизу.
 *
 * Гость видит контакты (DECISION 2026-05-20 «classifieds»), отзыв оставляет
 * после входа. Автор профиля вместо контактов видит «Редактировать профиль».
 */

import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DotsThree, InstagramLogo, LinkSimple, Star } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import {
  ExperienceBadge,
  GLASS_BUTTON_HEIGHT,
  GlassButton,
  InsetGroup,
  InsetRow,
  isVerifiedLevel,
  LargeTitleBar,
  useLargeTitle,
  VerifiedBadge,
} from "@/components/ui";
import { BottomEdgeEffect } from "@/components/ui/BottomEdgeEffect";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAdminSetUserStatus, useIsAdmin } from "@/features/admin/use-admin-actions";
import { GuestContactGate } from "@/features/auth/GuestContactGate";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { blockConfirmMessage } from "@/features/blocking/blocking-copy";
import { blockingActionFailureMessage } from "@/features/blocking/blocking-error-message";
import { useBlockUser } from "@/features/blocking/use-user-blocks";
import {
  formatServicePrice,
  useMasterServices,
} from "@/features/master-services/use-master-services";
import { formatRating, ReviewsSection } from "@/features/master-view/ReviewsSection";
import {
  useMasterCategoriesPublic,
  useMasterPhone,
  useMasterPublicProfile,
  useReviewsForTarget,
} from "@/features/master-view/use-master-public";
import { useRecordMasterView } from "@/features/master-view/use-record-view";
import {
  useMarkReviewsSeen,
  useUnreadReviewsCount,
} from "@/features/notifications/use-notifications";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { ReportModal } from "@/features/reports/ReportModal";
import { useReviewableOrderForMaster } from "@/features/reviews/use-reviews";
import { availabilityTitle } from "@/features/specialist/AvailabilityRows";
import { linkLabel } from "@/features/specialist/link-url";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { showActionMenu } from "@/lib/action-menu";
import { showAlert } from "@/lib/alert";
import { getCategoryIcon } from "@/lib/category-icons";
import { confirmAsync } from "@/lib/confirm";
import { hapticSuccess } from "@/lib/haptics";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import { getCityName } from "@/lib/location-config";
import { openExternalUrl } from "@/lib/open-link";
import { pluralizeReviews } from "@/lib/pluralize";
import { promptAsync } from "@/lib/prompt";
import { useAppWidth } from "@/lib/use-app-width";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import { resolveWhatsappDigits } from "@/lib/whatsapp";

const GAP = 6;
const PHOTOS_PREVIEW = 6;

function experienceLabel(years: number | null | undefined): string | null {
  if (!years || years <= 0) return null;
  if (years < 2) return "Опыт меньше года";
  if (years <= 3) return "Опыт 1–3 года";
  if (years <= 7) return "Опыт 3–7 лет";
  return "Опыт больше 7 лет";
}

export default function MasterPublicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const masterId = typeof id === "string" ? id : undefined;
  const { session } = useAuthSession();
  const currentUserId = session?.user?.id;
  const isOwn = !!currentUserId && currentUserId === masterId;
  const goBack = useSafeBack("/(tabs)" as never);
  const large = useLargeTitle();
  const tc = useThemeColors(["ink", "mute", "accent", "on-accent", "warning", "error", "on-dark"]);
  const { colorScheme } = useColorScheme();

  const profile = useMasterPublicProfile(masterId);
  const categories = useMasterCategoriesPublic(masterId);
  const portfolio = useMasterPortfolio(masterId);
  const reviews = useReviewsForTarget(masterId, "client_to_master");
  const masterPhone = useMasterPhone(masterId);
  const services = useMasterServices(masterId);
  // Отзыв — только по завершённому заданию с этим специалистом (0196).
  const reviewable = useReviewableOrderForMaster(masterId, currentUserId);
  const blockUser = useBlockUser();
  const recordView = useRecordMasterView();
  useEffect(() => {
    if (masterId && !isOwn) void recordView(masterId, "profile_open");
  }, [masterId, isOwn, recordView]);
  // Свой профиль открыт — новые отзывы увидены, бейдж «Специалистов» гаснет.
  const unreadReviews = useUnreadReviewsCount(isOwn ? currentUserId : undefined).data ?? 0;
  const markReviewsSeen = useMarkReviewsSeen(currentUserId).mutate;
  useEffect(() => {
    if (isOwn && unreadReviews > 0) markReviewsSeen();
  }, [isOwn, unreadReviews, markReviewsSeen]);

  const [lightbox, setLightbox] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const u = profile.data?.user;
  const m = profile.data?.master;
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "Специалист";
  const ratingAvg = m?.rating_overall_avg ?? null;
  const ratingCount = m?.rating_overall_count ?? 0;
  const place = u?.district ? u.district : u?.city_id ? getCityName(u.city_id) : null;
  // Одна тихая строка фактов под оценкой: место и опыт.
  const facts = [place, experienceLabel(m?.experience_years)].filter(Boolean).join(" · ");
  const phoneTel = masterPhone.data?.replace(/[^\d+]/g, "") || null;
  const phoneWa = resolveWhatsappDigits({
    whatsappPhone: m?.whatsapp_phone,
    whatsappSameAsPhone: m?.whatsapp_same_as_phone,
    masterPhone: masterPhone.data ?? null,
  });
  const photos = useMemo(
    () => (portfolio.data ?? []).map((p) => ({ id: p.id, url: p.url, caption: p.caption })),
    [portfolio.data],
  );
  const tile = gridWidth > 0 ? Math.floor((gridWidth - GAP * 2) / 3) : 0;
  // Фото для полноэкранного просмотра — заранее, в фоне: просмотр
  // открывается сразу, без ожидания (2026-10-03).
  const screenWidth = useAppWidth();
  useEffect(() => {
    if (photos.length === 0) return;
    void ExpoImage.prefetch(
      photos.map((p) => cdnImage(p.url, { width: Math.round(screenWidth), quality: 80 })),
      "memory-disk",
    ).catch(() => {
      // Не успели — просмотр загрузит сам.
    });
  }, [photos, screenWidth]);
  const showReviewCta = !!masterId && !isOwn && !!reviewable.data;
  const hasContacts = !!phoneTel || !!phoneWa;
  // У своего профиля нижней панели нет: сюда попадают из редактора
  // «Я специалист», и кнопка «Редактировать профиль» вернула бы туда,
  // откуда пришли (владелец, 2026-09-09: «обе кнопки удали»).
  // Гостю контакты не показываются — вместо них блок входа (2026-10-03).
  const isGuest = !currentUserId;
  const bottomBar = !isOwn && !isGuest && hasContacts;
  const bottomSpace = insets.bottom + 16 + (bottomBar ? GLASS_BUTTON_HEIGHT + 12 : 0);

  const handleBlock = async () => {
    if (!masterId || blockUser.isPending) return;
    const ok = await confirmAsync({
      title: "Заблокировать пользователя?",
      message: blockConfirmMessage(name),
      confirmText: "Заблокировать",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!ok) return;
    blockUser.mutate(masterId, {
      onSuccess: () => {
        hapticSuccess();
        goBack();
      },
      onError: (e) => showAlert("Не удалось заблокировать", blockingActionFailureMessage(e)),
    });
  };
  const isAdmin = useIsAdmin(currentUserId);
  const adminStatus = useAdminSetUserStatus();
  const adminSetStatus = async (status: "banned" | "active") => {
    if (!masterId) return;
    const reason = await promptAsync({
      title: status === "banned" ? "Заблокировать аккаунт" : "Снять блокировку",
      message: "Причина попадёт в журнал администратора.",
      confirmText: status === "banned" ? "Заблокировать" : "Снять",
    });
    if (!reason) return;
    adminStatus.mutate(
      { userId: masterId, status, reason },
      {
        onSuccess: () => hapticSuccess(),
        onError: (e) => showAlert("Не получилось", e.message),
      },
    );
  };
  const openActions = () => {
    const items: Array<{ label: string; onPress: () => void }> = [];
    if (currentUserId) items.push({ label: "Заблокировать", onPress: () => void handleBlock() });
    items.push({ label: "Пожаловаться", onPress: () => setReportOpen(true) });
    if (isAdmin && !isOwn) {
      items.push(
        u?.status === "banned"
          ? { label: "Снять блокировку (админ)", onPress: () => void adminSetStatus("active") }
          : {
              label: "Заблокировать аккаунт (админ)",
              onPress: () => void adminSetStatus("banned"),
            },
      );
    }
    showActionMenu({
      items: items.map((i) => ({ ...i, destructive: true })),
      colorScheme,
    });
  };
  const handleReview = () => {
    if (!currentUserId || !reviewable.data) return;
    router.push({
      pathname: "/master/review",
      params: { masterId: masterId ?? "", masterName: name, orderId: reviewable.data.id },
    } as never);
  };

  const loading = profile.isLoading || (profile.isFetching && !profile.data);
  const notFound = !loading && (profile.error || !u);

  return (
    <View className="flex-1 bg-surface-page">
      <Animated.ScrollView
        contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: bottomSpace + 24 }}
        onScroll={large.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="px-5 pt-3">
            <View className="flex-row items-center gap-4">
              <Skeleton width={96} height={96} className="rounded-full" />
              <View className="flex-1 gap-2">
                <Skeleton height={28} className="w-2/3 rounded" />
                <Skeleton height={18} className="w-1/3 rounded" />
              </View>
            </View>
            <Skeleton height={120} className="mt-8 rounded-2xl" />
            <Skeleton height={120} className="mt-4 rounded-2xl" />
          </View>
        ) : notFound ? (
          <View className="px-5 pt-6">
            <AppText weight="bold" className="text-ios-title1 text-ink">
              Профиль не найден
            </AppText>
            <AppText className="mt-2 text-ios-body text-mute">
              Возможно, специалист удалил аккаунт или ссылка устарела.
            </AppText>
          </View>
        ) : (
          <>
            {/* Шапка — по центру, как карточка в «Контактах» iOS 26: аватар,
                имя, одна строка оценки, одна тихая строка фактов (редизайн
                2026-10-03, docs/MASTER_PROFILE_REDESIGN_2026-10.md). */}
            <View className="items-center px-4 pt-2 pb-6">
              <Avatar url={u?.avatar_url} name={name} seed={masterId} size="xl" />
              <View className="mt-4 max-w-full flex-row items-center justify-center gap-2">
                <AppText
                  accessibilityRole="header"
                  weight="bold"
                  className="min-w-0 shrink text-center text-ios-title1 text-ink"
                  numberOfLines={2}
                >
                  {name}
                </AppText>
                {isVerifiedLevel(m?.verification_level) ? <VerifiedBadge size={22} /> : null}
              </View>
              <View className="mt-1.5 flex-row items-center gap-1.5">
                {ratingCount > 0 ? (
                  <>
                    <Star size={16} weight="fill" color={tc.warning} />
                    <AppText weight="semibold" className="text-ios-subheadline text-ink">
                      {formatRating(ratingAvg)}
                    </AppText>
                    <AppText className="text-ios-subheadline text-mute">
                      · {pluralizeReviews(ratingCount)}
                    </AppText>
                  </>
                ) : (
                  <AppText className="text-ios-subheadline text-mute">Отзывов пока нет</AppText>
                )}
              </View>
              {m?.experience_badge_at ? (
                <View className="mt-2">
                  <ExperienceBadge />
                </View>
              ) : null}
              {facts ? (
                <AppText
                  className="mt-1 text-center text-ios-subheadline text-mute"
                  numberOfLines={2}
                >
                  {facts}
                </AppText>
              ) : null}
              {m?.availability_status && m.availability_status !== "unspecified" ? (
                <AppText
                  weight="medium"
                  className={`mt-1 text-center text-ios-subheadline ${m.availability_status === "unavailable" ? "text-mute" : "text-success"}`}
                  numberOfLines={1}
                >
                  {availabilityTitle(m.availability_status)}
                </AppText>
              ) : null}
            </View>

            {/* Гость: контакты — только после входа (владелец, 2026-10-03). */}
            {isGuest && !isOwn ? (
              <View className="mx-4 mb-7 rounded-2xl bg-surface-card px-4 pb-4">
                <GuestContactGate
                  returnPath={`/master/${masterId}`}
                  title="Войдите, чтобы позвонить или написать специалисту"
                />
              </View>
            ) : null}

            {/* Чем занимается */}
            {(categories.data ?? []).length > 0 ? (
              <InsetGroup title="Чем занимается">
                {(categories.data ?? []).map((c, i, arr) => {
                  const Icon = getCategoryIcon(c.l2?.icon);
                  return (
                    // Только показ, без перехода: владелец, 2026-09-10 — «не надо,
                    // чтобы открывался раздел со всеми специалистами, просто
                    // показывай, чем занимается».
                    <InsetRow
                      key={c.l2_id}
                      title={c.l2?.name_ru ?? c.l2_id}
                      icon={<Icon size={18} weight="bold" color={tc.ink} />}
                      last={i === arr.length - 1}
                    />
                  );
                })}
              </InsetGroup>
            ) : null}

            {/* О себе — только когда есть текст: опыт стоит в шапке, и
                секция с одним опытом обещала больше, чем в ней было. */}
            {m?.bio?.trim() ? (
              <InsetGroup title="О себе">
                <AppText className="px-4 py-3.5 text-ios-body text-ink">{m.bio.trim()}</AppText>
              </InsetGroup>
            ) : null}

            {/* Instagram — только проверенный админом (0218, №207). Пометка о
                Meta — обязательная при упоминании в России. */}
            {m?.instagram ? (
              <InsetGroup
                title="Instagram*"
                footer="*Instagram принадлежит Meta — организация признана экстремистской и запрещена в России."
              >
                <InsetRow
                  title={`@${m.instagram}`}
                  icon={<InstagramLogo size={18} weight="bold" color={tc.ink} />}
                  navigates
                  onPress={() => openExternalUrl(`https://instagram.com/${m.instagram}`)}
                  last
                />
              </InsetGroup>
            ) : null}

            {/* Ссылка на соцсеть или сайт (0188). Показываем адрес целиком
                без схемы: чужая ссылка должна быть видна до нажатия. */}
            {m?.link_url ? (
              <InsetGroup title="Ссылка">
                <InsetRow
                  title={linkLabel(m.link_url)}
                  icon={<LinkSimple size={18} weight="bold" color={tc.ink} />}
                  navigates
                  onPress={() => openExternalUrl(m.link_url as string)}
                  last
                />
              </InsetGroup>
            ) : null}

            {/* Фото работ */}
            {photos.length > 0 ? (
              <View className="mb-7 px-4">
                <AppText
                  accessibilityRole="header"
                  className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute"
                >
                  Фото работ · {photos.length}
                </AppText>
                <View
                  className="flex-row flex-wrap"
                  style={{ gap: GAP }}
                  onLayout={(e) => setGridWidth(Math.round(e.nativeEvent.layout.width))}
                >
                  {photos.slice(0, PHOTOS_PREVIEW).map((p, i) => {
                    const rest = photos.length - PHOTOS_PREVIEW;
                    const isLast = i === PHOTOS_PREVIEW - 1 && rest > 0;
                    return (
                      <Pressable
                        key={p.id}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={`Фото работы ${i + 1}`}
                        onPress={() => setLightbox(i)}
                        className="overflow-hidden rounded-2xl active:opacity-80"
                        style={{ width: tile, height: tile }}
                      >
                        {/* Копия под размер плитки (~8 КБ вместо оригинала
                            ~120 КБ), кэш на диске, размытая заглушка сразу
                            (владелец, 2026-10-03: «фото грузятся супер долго»). */}
                        <ExpoImage
                          source={{ uri: cdnImage(p.url, { width: tile }) }}
                          placeholder={cdnBlur(p.url) ? { uri: cdnBlur(p.url) } : undefined}
                          style={{ width: tile, height: tile }}
                          contentFit="cover"
                          transition={120}
                          cachePolicy="memory-disk"
                          recyclingKey={p.id}
                          accessibilityIgnoresInvertColors
                        />
                        {isLast ? (
                          <View className="absolute inset-0 items-center justify-center bg-black/50">
                            <AppText
                              weight="bold"
                              className="text-ios-title2"
                              style={{ color: tc["on-dark"] }}
                            >
                              +{rest}
                            </AppText>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Услуги и цены — если специалист их заполнил */}
            {(services.data ?? []).length > 0 ? (
              <InsetGroup title="Услуги и цены">
                {(services.data ?? []).map((s, i, arr) => (
                  <InsetRow
                    key={s.id}
                    title={s.title}
                    value={formatServicePrice(s)}
                    last={i === arr.length - 1}
                  />
                ))}
              </InsetGroup>
            ) : null}

            {/* Отзывы */}
            <ReviewsSection
              title="Отзывы"
              emptyText="Отзывов пока нет. Отзыв оставляет клиент, который выбрал специалиста."
              query={reviews}
              ratingAvg={ratingAvg}
              ratingCount={ratingCount}
            />
            {showReviewCta ? (
              <View className="px-4">
                <GlassButton label="Оставить отзыв" onPress={handleReview} secondary neutral />
              </View>
            ) : null}
          </>
        )}
      </Animated.ScrollView>

      <LargeTitleBar
        title={name}
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        onBack={goBack}
        actions={
          // Свой профиль здесь только смотрят: правки живут в «Я специалист».
          isOwn
            ? []
            : [
                {
                  label: "Действия",
                  sf: "ellipsis",
                  Icon: DotsThree,
                  iconOnly: true,
                  onPress: openActions,
                },
              ]
        }
      />

      {/* Связь — плавающие кнопки внизу, на размытии (2026-10-03). */}
      {!loading && !notFound && bottomBar ? (
        <BottomEdgeEffect solid={insets.bottom + 4 + GLASS_BUTTON_HEIGHT + 8} />
      ) : null}
      {!loading && !notFound && bottomBar ? (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 flex-row gap-3 px-5"
          style={{ bottom: insets.bottom + 4 }}
        >
          {phoneTel ? (
            <View className="flex-1">
              <GlassButton label="Позвонить" onPress={() => openExternalUrl(`tel:${phoneTel}`)} />
            </View>
          ) : null}
          {phoneWa ? (
            <View className="flex-1">
              <GlassButton
                label="WhatsApp"
                onPress={() => openExternalUrl(`https://wa.me/${phoneWa}`)}
                secondary={!!phoneTel}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <PortfolioLightbox
        items={photos}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onChangeIndex={setLightbox}
      />
      {masterId ? (
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
