/**
 * Публичная страница клиента `/client/[id]`.
 *
 * Sprint 9.2 — минималистичная карточка для мастеров и других клиентов:
 *  - hero (avatar + имя + role + city + рейтинг)
 *  - chip с числом завершённых заказов
 *  - отзывы мастеров (direction='master_to_client')
 *
 * Доступна по тапу на имя клиента в OrderInfoBlock (sprint 8.4) и
 * в chat header (если собеседник-клиент).
 */

import { useLocalSearchParams } from "expo-router";
import { CheckCircle, DotsThreeVertical, WarningCircle } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader, Skeleton } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { blockConfirmMessage } from "@/features/blocking/blocking-copy";
import { blockingActionFailureMessage } from "@/features/blocking/blocking-error-message";
import { useBlockUser } from "@/features/blocking/use-user-blocks";
import { useClientPublicProfile } from "@/features/client-view/use-client-public";
import { ReviewsSection } from "@/features/master-view/ReviewsSection";
import { useReviewsForTarget } from "@/features/master-view/use-master-public";
import { ReportModal } from "@/features/reports/ReportModal";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { confirmAsync } from "@/lib/confirm";
import { hapticSuccess } from "@/lib/haptics";
import { pluralizeClosedOrders as pluralizeCompleted } from "@/lib/pluralize";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ClientPublicScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const clientId = typeof params.id === "string" ? params.id : null;

  const profile = useClientPublicProfile(clientId);
  const reviews = useReviewsForTarget(clientId, "master_to_client");
  const refresh = usePullToRefresh(["client-public", "reviews-for-target"]);
  const tc = useThemeColors(["ink", "muted-soft", "error", "success", "warning"]);
  const goBack = useSafeBack("/" as const);

  const { session } = useAuthSession();
  const currentUserId = session?.user?.id;
  const isOwnProfile = !!clientId && clientId === currentUserId;
  const isAnon = !currentUserId;
  const blockUser = useBlockUser();
  const [reportOpen, setReportOpen] = useState(false);
  const { colorScheme } = useColorScheme();

  const fullName = useMemo(() => {
    if (!profile.data?.user) return "";
    const u = profile.data.user;
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || "Клиент";
  }, [profile.data]);

  // Блокировка (UGC safety, App Store Guideline 1.2). См. пояснение в
  // app/(details)/master/[id].tsx: не обещаем «звонки и WhatsApp станут
  // недоступны» — вне-приложенческий контакт мы остановить не можем.
  const handleBlock = async () => {
    if (!clientId || blockUser.isPending) return;
    const confirmed = await confirmAsync({
      title: "Заблокировать пользователя?",
      message: blockConfirmMessage(fullName),
      confirmText: "Заблокировать",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!confirmed) return;
    blockUser.mutate(clientId, {
      onSuccess: () => {
        hapticSuccess();
        goBack();
      },
      onError: (e) => Alert.alert("Не удалось заблокировать", blockingActionFailureMessage(e)),
    });
  };

  // Меню «Действия» — нативный ActionSheetIOS вместо самописной шторки
  // (docs/IOS_FOUNDATION.md §2.8: выбор из нескольких действий — action sheet).
  // Максимум 2 пункта одновременно («Заблокировать» скрыт для анонима), оба —
  // destructive (были окрашены в error и в BottomSheet-варианте). Цвета/иконки
  // рисует система, отдельная раскраска пунктов больше не нужна.
  const openActionMenu = () => {
    const items: Array<{ label: string; onPress: () => void }> = [];
    if (!isAnon) items.push({ label: "Заблокировать", onPress: handleBlock });
    items.push({ label: "Пожаловаться", onPress: () => setReportOpen(true) });

    const cancelButtonIndex = items.length;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Действия",
        options: [...items.map((i) => i.label), "Отмена"],
        cancelButtonIndex,
        destructiveButtonIndex: items.map((_, i) => i),
        userInterfaceStyle: colorScheme,
      },
      (buttonIndex) => {
        if (buttonIndex === cancelButtonIndex) return;
        items[buttonIndex]?.onPress();
      },
    );
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Стандартный ScreenHeader — height 64, h-12 back, без title (имя
          клиента показывается hero-блоком ниже с аватаром).
          onBack идёт через useSafeBack — он берёт предыдущий path из
          in-app nav-history stack (см. src/lib/nav-history.ts). router.back()
          здесь не подходит: orders/[id] → client/[id] на вебе делается через
          history.replaceState, browser-history уже потерял точку возврата.
          iconAction (⋮) — overflow-меню «Заблокировать» / «Пожаловаться»,
          скрыт на своей же странице (isOwnProfile). */}
      <ScreenHeader
        title=""
        onBack={goBack}
        iconAction={
          !isOwnProfile && clientId
            ? {
                Icon: DotsThreeVertical,
                onPress: openActionMenu,
                accessibilityLabel: "Действия",
              }
            : undefined
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        {/* Цельный скелет вместо голого спиннера (равномерная загрузка,
            фидбэк владельца 2026-05-27): аватар + имя + бейдж + строки. */}
        {profile.isLoading && (
          <View className="px-5 pt-2">
            <View className="flex-row items-center gap-3">
              <Skeleton circle size={64} />
              <View className="flex-1">
                <Skeleton width="50%" height={20} style={{ borderRadius: 6 }} />
                <View className="mt-2">
                  <Skeleton width="35%" height={14} style={{ borderRadius: 4 }} />
                </View>
              </View>
            </View>
            <View className="mt-6">
              <Skeleton width="30%" height={16} style={{ borderRadius: 4 }} />
              <View className="mt-3">
                <Skeleton width="100%" height={72} style={{ borderRadius: 12 }} />
              </View>
              <View className="mt-3">
                <Skeleton width="100%" height={72} style={{ borderRadius: 12 }} />
              </View>
            </View>
          </View>
        )}

        {profile.error && (
          <View className="mt-20 items-center px-6">
            <WarningCircle size={32} weight="bold" color={tc.error} />
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
                    Клиент
                  </AppText>
                </View>
                {profile.data.completedOrdersCount > 0 && (
                  <View className="flex-row items-center gap-1 rounded-pill bg-success-soft px-2.5 py-1">
                    <CheckCircle size={12} weight="bold" color={tc.success} />
                    <AppText weight="medium" className="text-caption text-success">
                      {pluralizeCompleted(profile.data.completedOrdersCount)}
                    </AppText>
                  </View>
                )}
              </View>

              {/* Рейтинг клиента убран 2026-05-29 — у клиента нет рейтинга
                  (жалобы остаются, оценок нет). Город/район тоже не показываем. */}

              <AppText className="mt-2 text-caption text-muted-soft">
                На xtrud с {formatJoinDate(profile.data.user.created_at)}
              </AppText>
            </View>

            {/* Reviews */}
            <ReviewsSection
              title="Отзывы мастеров"
              emptyText="Пока никто не оставил отзыв."
              query={reviews}
            />
          </>
        )}
      </ScrollView>

      {!isOwnProfile && clientId ? (
        <ReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="user"
          targetId={clientId}
        />
      ) : null}
    </View>
  );
}

// ----------------------------------------------------------------------------

function formatJoinDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
