import { useLocalSearchParams, useRouter } from "expo-router";
import { DotsThree, Export, Star } from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { GLASS_BUTTON_HEIGHT, GlassButton, ScreenHeader, Skeleton } from "@/components/ui";
import { BottomEdgeEffect } from "@/components/ui/BottomEdgeEffect";
import { useAdminHideOrder, useIsAdmin } from "@/features/admin/use-admin-actions";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { blockConfirmMessage, blockSuccessMessage } from "@/features/blocking/blocking-copy";
import { blockingActionFailureMessage } from "@/features/blocking/blocking-error-message";
import { useBlockUser } from "@/features/blocking/use-user-blocks";
import { useMarkOrderNotificationsRead } from "@/features/notifications/use-notifications";
import { useCloseReasonPickerStore } from "@/features/orders/close-reason-picker-store";
import { ClientMasterResponseCard } from "@/features/orders/detail/ClientMasterResponseCard";
import { ClientResponsesSection } from "@/features/orders/detail/ClientResponsesSection";
import { MasterResponseSection } from "@/features/orders/detail/MasterResponseSection";
import { OrderInfoBlock } from "@/features/orders/detail/OrderInfoBlock";
import { orderShareMessage } from "@/features/orders/order-share";
import { orderStatusView } from "@/features/orders/order-status-view";
import { type CancelReason, useCancelOrder } from "@/features/orders/use-cancel-order";
import { useDeleteOrder } from "@/features/orders/use-delete-order";
import { useOrderDetail } from "@/features/orders/use-order-detail";
import { usePickOrderMaster } from "@/features/orders/use-order-lifecycle";
import { useMyResponseForOrder, useOrderResponses } from "@/features/orders/use-order-responses";
import { canReopenOrder, useReopenOrder } from "@/features/orders/use-reopen-order";
import { useRespondEligibility } from "@/features/orders/use-respond-eligibility";
import { useMarkResponsesViewed } from "@/features/orders/use-unread-responses";
import { ReportModal } from "@/features/reports/ReportModal";
import { useMyReviewForOrder } from "@/features/reviews/use-reviews";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { chooseAsync, showAlert } from "@/lib/alert";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { confirmAsync } from "@/lib/confirm";
import { describeServerError } from "@/lib/describe-server-error";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { promptAsync } from "@/lib/prompt";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

// ============================================================================
// Main
// ============================================================================

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const {
    data: order,
    isLoading,
    error,
    refetch: refetchOrder,
    isRefetching: isRefetchingOrder,
  } = useOrderDetail(id);

  const isOwner = !!userId && !!order && order.client_id === userId;

  // Если dual-role-пользователь сейчас в client-режиме смотрит чужой заказ, на
  // который уже откликался КАК МАСТЕР — показываем «Вы откликнулись» badge с
  // переключением в master-режим, вместо CTA «откликнуться» (нельзя
  // откликаться дважды на один и тот же заказ — фидбэк владельца 2026-05-27).
  // Запрашиваем только когда есть смысл (is_master + chase в client-режиме на
  // чужом заказе) — иначе тратили бы запрос на каждом просмотре.
  // Проверяем свой отклик для любого вошедшего, а не только для «мастера в
  // клиентском режиме»: режимов больше нет.
  const shouldCheckMyResponse = !isOwner && !!userId && !!id;
  const myMasterResponseQ = useMyResponseForOrder(
    shouldCheckMyResponse ? id : undefined,
    shouldCheckMyResponse ? userId : undefined,
  );
  const _hasMyMasterResponse = !!myMasterResponseQ.data;
  // Можно ли откликнуться: не автор, задание открыто и ждёт откликов, своего
  // отклика нет или он отозван. Гость тоже видит кнопку — через вход.
  const canRespond =
    !!order &&
    !isOwner &&
    order.status === "open" &&
    order.contact_mode !== "phone_open" &&
    (!userId || !myMasterResponseQ.data || myMasterResponseQ.data.status === "withdrawn");
  // Право откликнуться по категории (0217): спрашиваем заранее, база всё
  // равно проверит при отклике.
  const eligibilityQ = useRespondEligibility(id, canRespond && !!userId);
  const [reportOpen, setReportOpen] = useState(false);
  // Шит выбора причины закрытия заказа («нашёл мастера» / «больше не нужно»).
  // Выбор причины закрытия («нашёл мастера» / «больше не нужно») теперь на
  // отдельном route-экране (`/orders/close-reason`, нативная formSheet-модальность
  // — см. `docs/IOS_FOUNDATION.md` §2.4). Слушаем результат из транзитного
  // store и выполняем саму мутацию закрытия здесь же (пикер о сети не знает).
  const closeReasonResult = useCloseReasonPickerStore((s) => s.result);
  const setCloseReasonResult = useCloseReasonPickerStore((s) => s.setResult);
  const { colorScheme } = useColorScheme();

  // safeBack: на вебе orders/[id] и master/[id] живут в разных tab-стеках, поэтому
  // router.back() при cross-stack переходе срабатывает не туда. На web падаем
  // на window.history.back(), на native — обычный back с fallback'ом на список заказов.
  const goBack = useSafeBack("/(tabs)/orders" as const);

  // Гость нажал «Откликнуться», зарегистрировался и вернулся сюда: снимаем
  // одноразовый return-intent, чтобы он не сработал где-нибудь ещё. Форма
  // отклика для вошедшего уже на экране — больше ничего делать не нужно.
  useEffect(() => {
    if (!userId || !id) return;
    if (useAuthReturnUrlStore.getState().peekReturnUrl() === `/orders/${id}`) {
      useAuthReturnUrlStore.getState().consumeReturnUrl();
    }
  }, [userId, id]);

  // Sprint 12.3 — при open order detail (если owner) помечаем отклики просмотренными.
  const markResponsesViewed = useMarkResponsesViewed(userId);
  const markResponsesMutate = markResponsesViewed.mutate;
  useEffect(() => {
    if (isOwner && id) markResponsesMutate(id);
  }, [isOwner, id, markResponsesMutate]);

  // Уведомления об этом задании увидены — гаснут на колокольчике и иконке.
  const markOrderNotifications = useMarkOrderNotificationsRead(userId);
  const markOrderNotificationsMutate = markOrderNotifications.mutate;
  useEffect(() => {
    if (userId && id) markOrderNotificationsMutate(id);
  }, [userId, id, markOrderNotificationsMutate]);

  // 2026-05-21 (план ORDER_LIFECYCLE_CLIENT_PLAN.md): три действия клиента над
  // заказом — «Закрыть» (open → cancelled, с выбором причины), «Удалить»
  // (только cancelled/expired) и «Открыть заново» (cancelled/expired в окне
  // 7 дней). «Завершить» больше нет — успешный исход = «Закрыть → нашёл мастера».
  const cancelOrder = useCancelOrder();
  const deleteOrder = useDeleteOrder();
  const reopenOrder = useReopenOrder();
  const blockUser = useBlockUser();
  // Выбор исполнителя сразу закрывает задание (0208, DECISION 2026-09-30).
  const pickMaster = usePickOrderMaster();
  const accentColor = useThemeColors(["accent"]).accent;
  const ownerResponsesQ = useOrderResponses(isOwner ? id : undefined);
  const ownerResponses = ownerResponsesQ.data ?? [];
  const pickedResponse =
    order?.picked_master_id != null
      ? (ownerResponses.find((r) => r.master_id === order.picked_master_id) ?? null)
      : null;
  const pickedName =
    [pickedResponse?.master?.first_name, pickedResponse?.master?.last_name]
      .filter(Boolean)
      .join(" ") || "исполнителя";
  const myReview = useMyReviewForOrder(
    isOwner && order?.status === "completed" ? id : undefined,
    userId,
  );

  // Заказ закрыт клиентом или истёк → доступны «Удалить» / «Открыть заново».
  const isClosedHistory = !!order && (order.status === "cancelled" || order.status === "expired");
  const canReopen = !!order && canReopenOrder(order.status, order.updated_at);

  // Закрытие заказа с выбранной причиной. Вызывается из эффекта ниже, когда
  // `/orders/close-reason` коммитит выбор в store. useCallback — иначе эффект
  // ниже перезапускался бы на каждый рендер (функция не мемоизирована).
  const pickMutate = pickMaster.mutate;
  const pickResponse = useCallback(
    (responseId: string) => {
      if (!id || !userId) return;
      pickMutate(
        { orderId: id, responseId, clientId: userId },
        {
          onSuccess: () => hapticSuccess(),
          onError: (e) => {
            hapticError();
            showAlert("Не удалось выбрать", describeServerError(e, "Попробуйте ещё раз."));
          },
        },
      );
    },
    [id, userId, pickMutate],
  );

  const cancelMutate = cancelOrder.mutate;
  const handleCloseWithReason = useCallback(
    (reason: CancelReason, pickedMasterId: string | null = null) => {
      if (!id || !userId) return;
      // «Нашёл исполнителя» среди откликнувшихся — это выбор: с 0208 он сразу
      // закрывает задание, отзыв доступен сразу (DECISION 2026-09-30).
      if (reason === "found_master" && pickedMasterId) {
        const response = ownerResponses.find(
          (r) => r.master_id === pickedMasterId && (r.status === "sent" || r.status === "viewed"),
        );
        if (response) {
          pickResponse(response.id);
          return;
        }
      }
      cancelMutate(
        { orderId: id, clientId: userId, reason, pickedMasterId: null },
        {
          onSuccess: () => hapticSuccess(),
          onError: (e) => showAlert("Не удалось закрыть", e.message),
        },
      );
    },
    [id, userId, cancelMutate, ownerResponses, pickResponse],
  );

  const handlePickFromCard = async (responseId: string, masterName: string) => {
    const confirmed = await confirmAsync({
      title: `Выбрать исполнителем: ${masterName}?`,
      message:
        "Задание закроется, остальные отклики снимутся, исполнитель получит уведомление. Отменить выбор будет нельзя.",
      confirmText: "Выбрать",
      cancelText: "Отмена",
    });
    // Повторное нажатие, пока первый выбор ещё уходит на сервер, — не второй
    // запрос и не ложная ошибка «Не удалось выбрать» (аудит 2026-09-22).
    if (confirmed && !pickMaster.isPending) pickResponse(responseId);
  };

  const openReview = () => {
    if (!id || !order?.picked_master_id) return;
    router.push({
      pathname: "/master/review",
      params: {
        masterId: order.picked_master_id,
        masterName: pickedName === "исполнителя" ? "Исполнитель" : pickedName,
        orderId: id,
      },
    } as never);
  };

  useEffect(() => {
    if (!closeReasonResult || closeReasonResult.orderId !== id) return;
    handleCloseWithReason(closeReasonResult.reason, closeReasonResult.pickedMasterId ?? null);
    setCloseReasonResult(null);
  }, [closeReasonResult, id, setCloseReasonResult, handleCloseWithReason]);

  // Удаление заказа из «Истории». Подтверждение через confirmAsync
  // (работает и на вебе, в отличие от Alert.alert). После удаления уходим назад.
  const handleDelete = async () => {
    if (!id || !userId) return;
    const confirmed = await confirmAsync({
      title: "Удалить задание?",
      message:
        "Задание исчезнет из «Моих заданий» навсегда вместе с откликами. Это нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!confirmed) return;
    deleteOrder.mutate(
      { orderId: id, clientId: userId },
      {
        onSuccess: () => {
          hapticSuccess();
          goBack();
        },
        onError: (e) => {
          hapticError();
          showAlert("Не удалось удалить", e.message);
        },
      },
    );
  };

  // Блокировка заказчика (UGC safety, App Store Guideline 1.2). Целимся в
  // order.client_id напрямую — на профиль клиента не переходим, там нет живой
  // точки входа (решение владельца 2026-05-24). Текст подтверждения не
  // обещает «звонки и WhatsApp станут недоступны» — вне-приложенческий
  // контакт мы остановить не можем (см. app/(details)/master/[id].tsx).
  const handleBlockClient = async () => {
    if (!order || blockUser.isPending) return;
    const clientDisplay =
      [order.client?.first_name, order.client?.last_name].filter(Boolean).join(" ") || "Клиент";
    const confirmed = await confirmAsync({
      title: "Заблокировать клиента?",
      message: blockConfirmMessage(clientDisplay),
      confirmText: "Заблокировать",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!confirmed) return;
    blockUser.mutate(order.client_id, {
      onSuccess: () => {
        hapticSuccess();
        showAlert("Клиент заблокирован", blockSuccessMessage());
      },
      onError: (e) => showAlert("Не удалось заблокировать", blockingActionFailureMessage(e)),
    });
  };

  // Открыть заново — возвращает заказ в ленту мастеров (+14 дней).
  const handleReopen = () => {
    if (!id || !userId) return;
    reopenOrder.mutate(
      { orderId: id, userId },
      {
        onSuccess: () => hapticSuccess(),
        onError: (e) =>
          showAlert("Не удалось открыть заново", describeServerError(e, "Попробуйте ещё раз.")),
      },
    );
  };

  // Меню «Действия с заданием» — нативный ActionSheetIOS вместо самописной
  // шторки (docs/IOS_FOUNDATION.md §2.8). Набор действий зависит от статуса
  // (план §3 «состояние → действия»), условия гейтов не изменились:
  //   open:               Редактировать, Закрыть задание
  //   cancelled/expired:  Открыть заново (в окне 7 дней), Удалить
  //   чужой заказ:        Заблокировать заказчика, Пожаловаться
  //                       (UGC safety, App Store Guideline 1.2)
  // Максимум 2 пункта видно одновременно в любой комбинации статуса/владения.
  const isAdmin = useIsAdmin(userId);
  const adminHideOrder = useAdminHideOrder();
  const adminHide = async () => {
    if (!id) return;
    const reason = await promptAsync({
      title: "Скрыть задание",
      message: "Причина уйдёт автору в уведомлении и в журнал.",
      confirmText: "Скрыть",
    });
    if (!reason) return;
    adminHideOrder.mutate(
      { orderId: id, reason },
      {
        onSuccess: () => {
          hapticSuccess();
          router.back();
        },
        onError: (e) => showAlert("Не получилось", e.message),
      },
    );
  };
  // «Поделиться» — системное меню iOS: WhatsApp, Telegram, «Скопировать» —
  // всё, что стоит у человека (владелец, 2026-09-11). Только открытое
  // задание: закрытое чужим людям база не отдаёт, друг увидел бы пустоту.
  const canShare = !!order && !!id && order.status === "open";
  const shareOrder = () => {
    if (!order || !id) return;
    Share.share({ message: orderShareMessage(order.title, id) }).catch(() => {
      // Меню закрыли или системе не удалось — делать нечего.
    });
  };

  // Деструктивные помечены destructiveButtonIndex — систему красит сама.
  const openActionMenu = () => {
    if (!order) return;
    const items: Array<{ label: string; destructive?: boolean; onPress: () => void }> = [];
    if (isOwner && order.status === "open") {
      items.push({
        label: "Редактировать задание",
        onPress: () => router.push(`/orders/edit/${id}` as never),
      });
      items.push({
        label: "Закрыть задание",
        onPress: () =>
          router.push({ pathname: "/orders/close-reason", params: { orderId: id } } as never),
      });
    }
    if (isOwner && isClosedHistory && canReopen) {
      items.push({ label: "Открыть заново", onPress: handleReopen });
    }
    if (isOwner && isClosedHistory) {
      items.push({ label: "Удалить задание", destructive: true, onPress: handleDelete });
    }
    if (!isOwner) {
      items.push({
        label: "Заблокировать клиента",
        destructive: true,
        onPress: handleBlockClient,
      });
      items.push({
        label: "Пожаловаться на задание",
        destructive: true,
        onPress: () => setReportOpen(true),
      });
    }
    if (isAdmin && !isOwner && (order.status === "open" || order.status === "in_progress")) {
      items.push({
        label: "Скрыть задание (админ)",
        destructive: true,
        onPress: () => void adminHide(),
      });
    }
    if (items.length === 0) return;

    const cancelButtonIndex = items.length;
    const destructiveButtonIndex = items
      .map((item, i) => (item.destructive ? i : -1))
      .filter((i) => i >= 0);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Действия с заданием",
        options: [...items.map((item) => item.label), "Отмена"],
        cancelButtonIndex,
        destructiveButtonIndex,
        userInterfaceStyle: colorScheme,
      },
      (buttonIndex) => {
        if (buttonIndex === cancelButtonIndex) return;
        items[buttonIndex]?.onPress();
      },
    );
  };

  // Нужна категория, которой нет в профиле (№203) — системное окно с
  // переходом к категориям, а не ошибка после формы.
  const handleRespondPress = async () => {
    const e = eligibilityQ.data;
    if (userId && e && !e.allowed) {
      const name = e.categoryName ?? "этой категории";
      const choice = await chooseAsync({
        title: `Нужна категория «${name}»`,
        message:
          "Откликаться на такие задания могут специалисты этой категории. Добавьте её в профиль — это минута.",
        options: [{ id: "add", text: "Добавить категорию" }],
      });
      if (choice === "add") {
        router.push({
          pathname: "/profile/specialist/categories",
          params: e.categoryId ? { add: e.categoryId } : {},
        } as never);
      }
      return;
    }
    router.push(
      (userId
        ? { pathname: "/orders/respond", params: { orderId: id } }
        : { pathname: "/orders/respond-auth", params: { orderId: id } }) as never,
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      {/* ScreenHeader без title — заголовок переехал в body (hero-display
          под status). Header содержит только back + ⋮ overflow-меню.
          Паттерн Instagram-post / Twitter-tweet: entity-page без title в
          shell, hero внутри тела. Выбор user 2026-05-15. */}
      <ScreenHeader
        title=""
        onBack={goBack}
        iconAction={
          order && id && userId
            ? {
                Icon: DotsThree,
                onPress: openActionMenu,
                accessibilityLabel: "Действия с заданием",
              }
            : undefined
        }
        secondaryIconAction={
          canShare
            ? { Icon: Export, onPress: shareOrder, accessibilityLabel: "Поделиться заданием" }
            : undefined
        }
      />

      {/* Цельный скелет заказа вместо голого спиннера (равномерная загрузка,
          фидбэк владельца 2026-05-27): статус + заголовок + мета + описание +
          блок откликов. */}
      {isLoading && (
        <View className="px-5 pt-4">
          <Skeleton width={110} height={24} style={{ borderRadius: 999 }} />
          <View className="mt-4">
            <Skeleton width="80%" height={26} style={{ borderRadius: 6 }} />
          </View>
          <View className="mt-4 flex-row gap-2">
            <Skeleton width={120} height={16} style={{ borderRadius: 4 }} />
            <Skeleton width={90} height={16} style={{ borderRadius: 4 }} />
          </View>
          <View className="mt-5">
            <Skeleton width="100%" height={14} style={{ borderRadius: 4 }} />
            <View className="mt-2">
              <Skeleton width="92%" height={14} style={{ borderRadius: 4 }} />
            </View>
            <View className="mt-2">
              <Skeleton width="60%" height={14} style={{ borderRadius: 4 }} />
            </View>
          </View>
          <View className="mt-8">
            <Skeleton width="35%" height={18} style={{ borderRadius: 6 }} />
            <View className="mt-4">
              <Skeleton width="100%" height={72} style={{ borderRadius: 12 }} />
            </View>
            <View className="mt-3">
              <Skeleton width="100%" height={72} style={{ borderRadius: 12 }} />
            </View>
          </View>
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить задание. {error.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку задания"
            disabled={isRefetchingOrder}
            onPress={() => void refetchOrder()}
            className="mt-4 min-h-11 self-start items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-sm text-ink">
              {isRefetchingOrder ? "Загружаем…" : "Повторить"}
            </AppText>
          </Pressable>
        </View>
      )}

      {/* Задания нет: закрыли, удалили или скрыли. Раньше экран оставался
          пустым — теперь сюда чаще приходят по ссылке от друга. */}
      {!isLoading && !error && !order ? (
        <View className="mt-8 px-6">
          <AppText weight="semibold" className="text-ios-title2 text-ink">
            Задание недоступно
          </AppText>
          <AppText className="mt-1.5 text-ios-subheadline text-mute">
            Его закрыли или удалили. Посмотрите другие задания.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="К заданиям"
            onPress={() => router.replace("/(tabs)/find" as never)}
            className="mt-4 min-h-11 self-start items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-sm text-ink">
              К заданиям
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {order && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 + (canRespond ? 72 : 0) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OrderInfoBlock
            order={order}
            isOwner={isOwner}
            isGuest={!userId}
            myResponseStatus={myMasterResponseQ.data?.status}
          />

          {/* Выбранный исполнитель — отдельно, над остальными откликами. */}
          {isOwner && pickedResponse && order.status !== "open" ? (
            <View className="mt-8 px-5">
              <AppText weight="semibold" className="text-title-md tracking-tight text-ink">
                Исполнитель
              </AppText>
              <View className="mt-3">
                <ClientMasterResponseCard
                  response={pickedResponse}
                  isRejecting={false}
                  onReject={undefined}
                  statusView={orderStatusView({ role: "client", order })}
                />
              </View>
              {/* Отзыв — здесь, у выбранного исполнителя: отдельного блока
                  «Работа выполнена» больше нет (DECISION 2026-09-30). */}
              {order.status === "completed" && !myReview.isLoading ? (
                myReview.data ? (
                  <AppText className="mt-3 text-ios-subheadline text-mute">
                    Вы оставили отзыв
                  </AppText>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Оставить отзыв: ${pickedName}`}
                    onPress={openReview}
                    className="mt-3 min-h-12 flex-row items-center justify-center gap-2 rounded-pill border-2 border-accent bg-canvas px-4 active:bg-accent-soft"
                  >
                    <Star size={18} weight="bold" color={accentColor} />
                    <AppText weight="semibold" className="text-body-md text-accent">
                      Оставить отзыв
                    </AppText>
                  </Pressable>
                )
              ) : null}
            </View>
          ) : null}

          {isOwner && id && order && order.contact_mode !== "phone_open" ? (
            <ClientResponsesSection
              orderId={id}
              order={order}
              onPick={(responseId, masterName) => void handlePickFromCard(responseId, masterName)}
              picking={pickMaster.isPending}
            />
          ) : null}
          {isOwner && order.contact_mode === "phone_open" ? (
            <View className="mx-5 mt-6 rounded-2xl bg-canvas-soft p-4">
              <AppText weight="semibold" className="text-ios-body text-ink">
                Специалисты свяжутся напрямую
              </AppText>
              <AppText className="mt-1 text-ios-subheadline text-mute">
                Вы выбрали связь по номеру: откликов в приложении не будет, специалисты позвонят или
                напишут в WhatsApp.
              </AppText>
            </View>
          ) : null}
          {/* Откликнуться может любой аккаунт, кроме автора задания
              (DECISION владельца 2026-09-01). Раньше форма показывалась
              только в «режиме мастера», и человеку приходилось сначала
              переключаться — три разные карточки-подсказки ниже существовали
              ровно ради этого перехода. */}
          {/* Гость видит ту же кнопку, что и вошедший (DECISION владельца
              2026-09-06): по нажатию — вход/регистрация и возврат сюда. */}
          {!isOwner && userId && id && order.contact_mode !== "phone_open" && (
            <MasterResponseSection
              orderId={id}
              masterId={userId}
              orderStatus={order.status}
              pickedMasterId={order.picked_master_id}
            />
          )}
        </ScrollView>
      )}

      {/* Отклик — отдельная шторка; кнопка плавает внизу, как главное
          действие экрана (DECISION владельца 2026-09-07). Гость — через вход. */}
      {canRespond && id ? (
        // Под кнопкой — размытие (владелец, 2026-10-03: кнопка сливалась с
        // текстом и картинками); кнопка ближе к нижнему краю.
        <BottomEdgeEffect solid={insets.bottom + 4 + GLASS_BUTTON_HEIGHT + 8} />
      ) : null}
      {canRespond && id ? (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 px-5"
          style={{ bottom: insets.bottom + 4 }}
        >
          <GlassButton
            label={
              myMasterResponseQ.data?.status === "withdrawn" ? "Откликнуться снова" : "Откликнуться"
            }
            onPress={() => void handleRespondPress()}
          />
        </View>
      ) : null}

      {id && (
        <ReportModal
          visible={reportOpen}
          targetType="order"
          targetId={id}
          onClose={() => setReportOpen(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}
