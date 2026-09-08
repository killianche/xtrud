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

import { useLocalSearchParams, useRouter } from "expo-router";
import { DotsThree, Image as ImageIcon, PencilSimple, Star } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Animated, Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import {
  GLASS_BUTTON_HEIGHT,
  GlassButton,
  InsetGroup,
  InsetRow,
  isVerifiedLevel,
  LargeTitleBar,
  useLargeTitle,
  VerifiedBadge,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAdminSetUserStatus, useIsAdmin } from "@/features/admin/use-admin-actions";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { blockConfirmMessage } from "@/features/blocking/blocking-copy";
import { blockingActionFailureMessage } from "@/features/blocking/blocking-error-message";
import { useBlockUser } from "@/features/blocking/use-user-blocks";
import {
  formatServicePrice,
  useMasterServices,
} from "@/features/master-services/use-master-services";
import { ReviewsSection } from "@/features/master-view/ReviewsSection";
import {
  useMasterCategoriesPublic,
  useMasterPhone,
  useMasterPublicProfile,
  useReviewsForTarget,
} from "@/features/master-view/use-master-public";
import { useRecordMasterView } from "@/features/master-view/use-record-view";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { ReportModal } from "@/features/reports/ReportModal";
import { useMyRecentReviewForMaster } from "@/features/reviews/use-reviews";
import { availabilityTitle } from "@/features/specialist/AvailabilityRows";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getCategoryIcon } from "@/lib/category-icons";
import { confirmAsync } from "@/lib/confirm";
import { hapticSuccess } from "@/lib/haptics";
import { getCityName } from "@/lib/location-config";
import { openExternalUrl } from "@/lib/open-link";
import { promptAsync } from "@/lib/prompt";
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
  const recentReview = useMyRecentReviewForMaster(masterId, currentUserId);
  const blockUser = useBlockUser();
  const recordView = useRecordMasterView();
  useEffect(() => {
    if (masterId && !isOwn) void recordView(masterId, "profile_open");
  }, [masterId, isOwn, recordView]);

  const [lightbox, setLightbox] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const u = profile.data?.user;
  const m = profile.data?.master;
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "Специалист";
  const ratingAvg = m?.rating_overall_avg ?? null;
  const ratingCount = m?.rating_overall_count ?? 0;
  const place = u?.district ? u.district : u?.city_id ? getCityName(u.city_id) : null;
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
  const showReviewCta = !!masterId && !isOwn && !recentReview.data;
  const hasContacts = !!phoneTel || !!phoneWa;
  const bottomBar = isOwn || hasContacts;
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
      onError: (e) => Alert.alert("Не удалось заблокировать", blockingActionFailureMessage(e)),
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
        onError: (e) => Alert.alert("Не получилось", e.message),
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
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...items.map((i) => i.label), "Отмена"],
        cancelButtonIndex: items.length,
        destructiveButtonIndex: items.map((_, i) => i),
        userInterfaceStyle: colorScheme,
      },
      (i) => items[i]?.onPress(),
    );
  };
  const handleReview = () => {
    if (!currentUserId) {
      router.push("/(auth)/phone" as never);
      return;
    }
    router.push({
      pathname: "/master/review",
      params: { masterId: masterId ?? "", masterName: name },
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
            {/* Шапка: аватар, имя, рейтинг, место */}
            <View className="flex-row items-center gap-4 px-5 pt-3 pb-6">
              <Avatar url={u?.avatar_url} name={name} seed={masterId} size="xl" />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <AppText
                    weight="bold"
                    className="min-w-0 shrink text-ios-title1 text-ink"
                    numberOfLines={2}
                  >
                    {name}
                  </AppText>
                  {isVerifiedLevel(m?.verification_level) ? <VerifiedBadge size={22} /> : null}
                </View>
                <View className="mt-1 flex-row items-center gap-1.5">
                  {ratingCount > 0 ? (
                    <>
                      <Star size={16} weight="fill" color={tc.warning} />
                      <AppText weight="semibold" className="text-ios-subheadline text-ink">
                        {Number(ratingAvg ?? 0).toFixed(1)}
                      </AppText>
                      <AppText className="text-ios-subheadline text-mute">
                        · {ratingCount} отзывов
                      </AppText>
                    </>
                  ) : (
                    <AppText className="text-ios-subheadline text-mute">Отзывов пока нет</AppText>
                  )}
                </View>
                {place ? (
                  <AppText className="mt-0.5 text-ios-subheadline text-mute" numberOfLines={1}>
                    {place}
                  </AppText>
                ) : null}
                {m?.availability_status && m.availability_status !== "unspecified" ? (
                  <AppText
                    weight="medium"
                    className={`mt-1 text-ios-subheadline ${m.availability_status === "unavailable" ? "text-mute" : "text-success"}`}
                    numberOfLines={1}
                  >
                    {availabilityTitle(m.availability_status)}
                  </AppText>
                ) : null}
              </View>
            </View>

            {/* Чем занимается */}
            {(categories.data ?? []).length > 0 ? (
              <InsetGroup title="Чем занимается">
                {(categories.data ?? []).map((c, i, arr) => {
                  const Icon = getCategoryIcon(c.l2?.icon);
                  return (
                    <InsetRow
                      key={c.l2_id}
                      title={c.l2?.name_ru ?? c.l2_id}
                      icon={<Icon size={18} weight="bold" color={tc.ink} />}
                      navigates
                      onPress={() =>
                        router.push({
                          pathname: "/specialists/section",
                          params: { l2: c.l2_id },
                        } as never)
                      }
                      last={i === arr.length - 1}
                    />
                  );
                })}
              </InsetGroup>
            ) : null}

            {/* О себе */}
            {m?.bio?.trim() || experienceLabel(m?.experience_years) ? (
              <View className="mb-7 px-4">
                <AppText className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute">
                  О себе
                </AppText>
                <View className="rounded-2xl bg-canvas px-4 py-3.5">
                  {m?.bio?.trim() ? (
                    <AppText className="text-ios-body text-ink">{m.bio.trim()}</AppText>
                  ) : null}
                  {experienceLabel(m?.experience_years) ? (
                    <AppText
                      className={`text-ios-subheadline text-mute ${m?.bio?.trim() ? "mt-2" : ""}`}
                    >
                      {experienceLabel(m?.experience_years)}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Фото работ */}
            {photos.length > 0 ? (
              <View className="mb-7 px-4">
                <View className="mb-1.5 ml-4 flex-row items-center gap-1.5">
                  <ImageIcon size={14} weight="bold" color={tc.mute} />
                  <AppText className="text-ios-footnote uppercase text-mute">
                    Фото работ · {photos.length}
                  </AppText>
                </View>
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
                        <Image
                          source={{ uri: p.url }}
                          style={{ width: tile, height: tile }}
                          resizeMode="cover"
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
            <View className="px-4">
              <ReviewsSection
                title="Отзывы"
                emptyText="Отзывов пока нет. Станьте первым, кто расскажет о работе."
                query={reviews}
              />
              {showReviewCta ? (
                <View className="mt-3">
                  <GlassButton label="Оставить отзыв" onPress={handleReview} secondary />
                </View>
              ) : null}
            </View>
          </>
        )}
      </Animated.ScrollView>

      <LargeTitleBar
        title={name}
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        onBack={goBack}
        actions={
          isOwn
            ? [
                {
                  label: "Редактировать профиль",
                  sf: "pencil",
                  Icon: PencilSimple,
                  iconOnly: true,
                  onPress: () => router.push("/profile/specialist" as never),
                },
              ]
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

      {/* Связь — плавающие стеклянные кнопки внизу */}
      {!loading && !notFound && bottomBar ? (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 flex-row gap-3 px-5"
          style={{ bottom: insets.bottom + 16 }}
        >
          {isOwn ? (
            <View className="flex-1">
              <GlassButton
                label="Редактировать профиль"
                onPress={() => router.push("/profile/specialist" as never)}
              />
            </View>
          ) : (
            <>
              {phoneTel ? (
                <View className="flex-1">
                  <GlassButton
                    label="Позвонить"
                    onPress={() => openExternalUrl(`tel:${phoneTel}`)}
                  />
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
            </>
          )}
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
