import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowCounterClockwise,
  CaretRight,
  CheckCircle,
  Clock,
  DotsThree,
  MapPin,
  PaperPlaneTilt,
  Phone,
  Question,
  Star,
  Users,
  Wallet,
  WhatsappLogo,
} from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { GlassButton, InsetGroup, InsetRow, ScreenHeader, Skeleton } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAdminHideOrder, useIsAdmin } from "@/features/admin/use-admin-actions";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { blockConfirmMessage, blockSuccessMessage } from "@/features/blocking/blocking-copy";
import { blockingActionFailureMessage } from "@/features/blocking/blocking-error-message";
import { useBlockUser } from "@/features/blocking/use-user-blocks";
import { useMasterPhone, useMasterPublicProfile } from "@/features/master-view/use-master-public";
import { useCloseReasonPickerStore } from "@/features/orders/close-reason-picker-store";
import { OrderPhotoCarousel } from "@/features/orders/OrderPhotoCarousel";
import { formatOrderTiming, formatPrice } from "@/features/orders/order-schema";
import { type CancelReason, useCancelOrder } from "@/features/orders/use-cancel-order";
import { useDeleteOrder } from "@/features/orders/use-delete-order";
import { type OrderDetail, useOrderDetail } from "@/features/orders/use-order-detail";
import {
  type OrderResponseWithMaster,
  useMyResponseForOrder,
  useOrderResponses,
} from "@/features/orders/use-order-responses";
import { useRejectResponse } from "@/features/orders/use-reject-response";
import { canReopenOrder, useReopenOrder } from "@/features/orders/use-reopen-order";
import { useMarkResponsesViewed } from "@/features/orders/use-unread-responses";
import { useWithdrawResponse } from "@/features/orders/use-withdraw-response";
import { ReportModal } from "@/features/reports/ReportModal";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { confirmAsync } from "@/lib/confirm";
import { describeServerError } from "@/lib/describe-server-error";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { openExternalUrl } from "@/lib/open-link";
import { promptAsync } from "@/lib/prompt";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import { normalizeWhatsappDigits, resolveWhatsappDigits } from "@/lib/whatsapp";
import type { Database, Tables } from "@/types/database";

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

  // 2026-05-21 (план ORDER_LIFECYCLE_CLIENT_PLAN.md): три действия клиента над
  // заказом — «Закрыть» (open → cancelled, с выбором причины), «Удалить»
  // (только cancelled/expired) и «Открыть заново» (cancelled/expired в окне
  // 7 дней). «Завершить» больше нет — успешный исход = «Закрыть → нашёл мастера».
  const cancelOrder = useCancelOrder();
  const deleteOrder = useDeleteOrder();
  const reopenOrder = useReopenOrder();
  const blockUser = useBlockUser();

  // Заказ закрыт клиентом или истёк → доступны «Удалить» / «Открыть заново».
  const isClosedHistory = !!order && (order.status === "cancelled" || order.status === "expired");
  const canReopen = !!order && canReopenOrder(order.status, order.updated_at);

  // Закрытие заказа с выбранной причиной. Вызывается из эффекта ниже, когда
  // `/orders/close-reason` коммитит выбор в store. useCallback — иначе эффект
  // ниже перезапускался бы на каждый рендер (функция не мемоизирована).
  const handleCloseWithReason = useCallback(
    (reason: CancelReason, pickedMasterId: string | null = null) => {
      if (!id || !userId) return;
      cancelOrder.mutate(
        { orderId: id, clientId: userId, reason, pickedMasterId },
        { onError: (e) => Alert.alert("Не удалось закрыть", e.message) },
      );
    },
    [id, userId, cancelOrder],
  );

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
          Alert.alert("Не удалось удалить", e.message);
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
      title: "Заблокировать заказчика?",
      message: blockConfirmMessage(clientDisplay),
      confirmText: "Заблокировать",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!confirmed) return;
    blockUser.mutate(order.client_id, {
      onSuccess: () => {
        hapticSuccess();
        Alert.alert("Заказчик заблокирован", blockSuccessMessage());
      },
      onError: (e) => Alert.alert("Не удалось заблокировать", blockingActionFailureMessage(e)),
    });
  };

  // Открыть заново — возвращает заказ в ленту мастеров (+14 дней).
  const handleReopen = () => {
    if (!id || !userId) return;
    reopenOrder.mutate(
      { orderId: id, userId },
      { onError: (e) => Alert.alert("Не удалось открыть заново", e.message) },
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
        onError: (e) => Alert.alert("Не получилось", e.message),
      },
    );
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
        label: "Заблокировать заказчика",
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

      {order && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 + (canRespond ? 72 : 0) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OrderInfoBlock order={order} isOwner={isOwner} />

          {isOwner && id && userId && order ? (
            <CloseOrderHint
              order={order}
              orderId={id}
              onCloseRequested={() =>
                router.push({ pathname: "/orders/close-reason", params: { orderId: id } } as never)
              }
            />
          ) : null}

          {isOwner && id && order && order.contact_mode !== "phone_open" ? (
            <ClientResponsesSection orderId={id} order={order} />
          ) : null}
          {isOwner && order.contact_mode === "phone_open" ? (
            <View className="mx-5 mt-6 rounded-2xl bg-canvas-soft p-4">
              <AppText weight="semibold" className="text-ios-body text-ink">
                Мастера свяжутся напрямую
              </AppText>
              <AppText className="mt-1 text-ios-subheadline text-mute">
                Вы выбрали связь по номеру: откликов в приложении не будет, мастера позвонят или
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
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 px-5"
          style={{ bottom: insets.bottom + 16 }}
        >
          <GlassButton
            label={
              myMasterResponseQ.data?.status === "withdrawn" ? "Откликнуться снова" : "Откликнуться"
            }
            onPress={() =>
              router.push(
                (userId
                  ? { pathname: "/orders/respond", params: { orderId: id } }
                  : { pathname: "/orders/respond-auth", params: { orderId: id } }) as never,
              )
            }
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

// ============================================================================
// ============================================================================
// ============================================================================
// ============================================================================
// CloseOrderHint — баннер «Нашли мастера? Закройте заказ».
// Показывается клиенту-владельцу, когда:
//   - order.status === 'open'
//   - order.created_at старше 24 часов
//   - есть хотя бы 1 отклик
// Это паттерн Avito/Profi.ru: реминд клиенту закрыть заказ чтобы остановить
// поток откликов от мастеров. Без этого мастера продолжают писать даже когда
// клиент уже нашёл подрядчика офлайн.
// ============================================================================

interface CloseOrderHintProps {
  order: NonNullable<ReturnType<typeof useOrderDetail>["data"]>;
  orderId: string;
  /** Открыть шит выбора причины закрытия (единый флоу с action-меню). */
  onCloseRequested: () => void;
}

function CloseOrderHint({ order, orderId, onCloseRequested }: CloseOrderHintProps) {
  const tc = useThemeColors(["accent", "muted-soft"]);
  const { data: responses } = useOrderResponses(orderId);

  // Условия показа
  const isOpen = order.status === "open";
  const createdMs = order.created_at ? new Date(order.created_at).getTime() : 0;
  const ageHours = createdMs > 0 ? (Date.now() - createdMs) / 3_600_000 : 0;
  const activeResponseCount = (responses ?? []).filter((r) => r.status !== "rejected").length;
  const shouldShow = isOpen && ageHours >= 24 && activeResponseCount >= 1;

  if (!shouldShow) return null;

  return (
    // Подсказка, а не статус: раньше акцентная плашка с галочкой читалась как
    // «исполнитель найден» (владелец, 2026-09-08). Нейтральная поверхность,
    // вопрос и объяснение.
    <View className="mt-6 mx-5 rounded-xl border border-hairline bg-canvas p-4 flex-row items-start gap-3">
      <Question size={22} weight="bold" color={tc["muted-soft"]} />
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink">
          Договорились с кем-то из откликнувшихся?
        </AppText>
        <AppText className="mt-1 text-body-sm text-body">
          Тогда закройте задание и укажите, кто сделал работу. Остальные перестанут откликаться, а
          исполнитель получит уведомление. Если ещё выбираете — ничего делать не нужно.
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть задание"
          onPress={onCloseRequested}
          className="mt-3 min-h-11 self-start flex-row items-center justify-center px-4 rounded-full bg-primary active:opacity-80"
        >
          <AppText weight="semibold" className="text-button text-on-primary">
            Закрыть задание
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// ============================================================================
// Order info block — общий для всех
// ============================================================================

interface OrderInfoBlockProps {
  order: NonNullable<ReturnType<typeof useOrderDetail>["data"]>;
  /** Клиент сам же видит свой заказ? Тогда «Заказчик»-карточка не показывается
   *  (не показывать себе себя). */
  isOwner: boolean;
}

function OrderInfoBlock({ order, isOwner }: OrderInfoBlockProps) {
  const clientDisplay =
    [order.client?.first_name, order.client?.last_name].filter(Boolean).join(" ") || "Клиент";
  // Имя, которое видит мастер: введённое клиентом в заказе (contact_name) →
  // иначе регистрационное. Профиль/рейтинг/переход НЕ показываем — просто имя
  // (решение владельца 2026-05-24).
  const contactDisplay = order.contact_name?.trim() || clientDisplay;
  const tc = useThemeColors(["muted-soft", "mute", "ink", "warning", "error"]);

  // Бюджет — отдельный display-режим: разделяем сумму и пометку «договорной».
  const budgetText = formatBudget(order);
  const isNegotiable = order.budget_kind === "negotiable";
  // Срочный заказ — мета «Срочно» красным (как в Linear-референсе детали).
  const isUrgent = order.urgency === "urgent";

  return (
    <View className="px-5 pt-2">
      {/* Статус + категория. */}
      <View className="flex-row items-center gap-2">
        <OrderStatusBadge status={order.status} size="md" />
        <AppText className="text-caption text-mute">·</AppText>
        <AppText weight="medium" className="text-caption text-body">
          {order.l2?.name_ru ?? order.l2_id}
        </AppText>
      </View>

      <AppText weight="display" className="mt-3 text-display-md tracking-tight text-ink">
        {order.title}
      </AppText>

      {/* Редизайн 2026-09-02 по образцу владельца: информация не серым, а
          читаемым цветом; микроиконки; жирные заголовки секций; всё стопкой
          друг под другом, а не разбросано. Каждая секция — заголовок + тело. */}

      {/* Бюджет */}
      {budgetText ? (
        <View className="mt-6">
          <AppText weight="bold" className="text-title-md text-ink">
            Бюджет
          </AppText>
          <View className="mt-2 flex-row items-center gap-2">
            <Wallet size={18} weight="bold" color={tc.ink} />
            <AppText
              weight={isNegotiable ? "semibold" : "mono"}
              className="text-display-md text-ink tracking-tight"
            >
              {isNegotiable ? "Договорная" : budgetText}
            </AppText>
          </View>
        </View>
      ) : null}

      {/* Описание */}
      {order.description ? (
        <View className="mt-6">
          <AppText weight="bold" className="text-title-md text-ink">
            Описание
          </AppText>
          <AppText className="mt-2 text-body-md text-ink" style={{ lineHeight: 24 }}>
            {order.description}
          </AppText>
        </View>
      ) : null}

      {order.photo_urls && order.photo_urls.length > 0 ? (
        <View className="mt-5 -mx-5">
          <OrderPhotoCarousel urls={order.photo_urls} />
        </View>
      ) : null}

      {/* Детали — список «иконка + факт», всё в ink. Только то, что есть в
          данных: срочность/дата, место, число откликов. Ничего не выдумываем
          (design-quality.md §5). */}
      <View className="mt-6">
        <AppText weight="bold" className="text-title-md text-ink">
          Детали
        </AppText>
        <View className="mt-2 gap-3">
          <View className="flex-row items-center gap-3">
            <Clock size={18} weight="bold" color={isUrgent ? tc.error : tc.ink} />
            <AppText
              weight={isUrgent ? "semibold" : "medium"}
              className={`flex-1 text-body-md ${isUrgent ? "text-error-deep" : "text-ink"}`}
            >
              {formatOrderTiming(order.urgency, order.preferred_date)}
            </AppText>
          </View>
          <View className="flex-row items-center gap-3">
            <MapPin size={18} weight="bold" color={tc.ink} />
            <AppText weight="medium" className="flex-1 text-body-md text-ink">
              {order.city?.name ?? order.city_id}
              {order.district ? `, ${order.district}` : ""}
              {order.address ? `, ${order.address}` : ""}
            </AppText>
          </View>
          <View className="flex-row items-center gap-3">
            <Users size={18} weight="bold" color={tc.ink} />
            <AppText weight="medium" className="flex-1 text-body-md text-ink">
              {order.responses_count === 0
                ? "Откликов пока нет"
                : `Откликов: ${order.responses_count}`}
            </AppText>
          </View>
        </View>
      </View>

      {/* Заказчик — просто имя (решение владельца 2026-05-24). */}
      {!isOwner ? (
        <View className="mt-6">
          <AppText weight="bold" className="text-title-md text-ink">
            Заказчик
          </AppText>
          <View className="mt-2 flex-row items-center gap-3 rounded-xl border border-hairline bg-canvas-soft p-3">
            <Avatar url={null} name={contactDisplay} seed={contactDisplay} size="md" />
            <AppText weight="semibold" className="flex-1 text-body-md text-ink" numberOfLines={1}>
              {contactDisplay}
            </AppText>
          </View>
          {/* Контакты, которые заказчик сам оставил в задании (0159, режим
              «напрямую» — 0168). Нет — значит связь через отклик. */}
          {order.contact_mode === "phone_open" ? (
            <AppText className="mt-3 text-ios-subheadline text-mute">
              Заказчик ждёт звонка или сообщения — откликов в приложении здесь нет.
            </AppText>
          ) : null}
          {order.contact_phone || order.whatsapp_phone ? (
            <View className="mt-2 flex-row gap-2">
              {order.contact_phone ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Позвонить ${order.contact_phone}`}
                  onPress={() => openExternalUrl(`tel:${order.contact_phone}`)}
                  className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
                >
                  <Phone size={18} weight="bold" color={tc.ink} />
                  <AppText weight="semibold" className="text-body-md text-ink">
                    Позвонить
                  </AppText>
                </Pressable>
              ) : null}
              {order.whatsapp_phone ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Написать в WhatsApp"
                  onPress={() =>
                    openExternalUrl(
                      `https://wa.me/${normalizeWhatsappDigits(order.whatsapp_phone)}`,
                    )
                  }
                  className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
                >
                  <WhatsappLogo size={18} weight="bold" color={tc.ink} />
                  <AppText weight="semibold" className="text-body-md text-ink">
                    WhatsApp
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function formatBudget(o: {
  budget_kind: Database["public"]["Enums"]["order_price_kind"];
  budget_value: number | null;
}): string {
  // Делегирует общему форматтеру цены из order-schema.
  return formatPrice(o.budget_kind, o.budget_value);
}

// ============================================================================
// Client responses section — клиент видит отклики на свой заказ
//
// 2026-05-20 «classifieds»: убрана кнопка «Выбрать этого мастера»
// (accept_response) и кнопка «Написать» (in-app chat). Каждая карточка
// показывает 3 прямые контакт-кнопки: «Позвонить», «WhatsApp», «Профиль».
// Reject (скрыть отклик) оставлен — это локальное действие клиента, без
// уведомлений. Sections «picked / actionable / passive» свёрнуты в единый
// список — модели «выбранного мастера» больше нет.
// ============================================================================

interface ClientResponsesSectionProps {
  orderId: string;
  order: OrderDetail;
}

function ClientResponsesSection({ orderId, order }: ClientResponsesSectionProps) {
  const tc = useThemeColors(["muted-soft"]);
  const router = useRouter();
  const {
    data: responses,
    isLoading,
    error,
    refetch: refetchResponses,
    isRefetching: isRefetchingResponses,
  } = useOrderResponses(orderId);
  const rejectResponse = useRejectResponse();

  // Точечный pending-state: какой именно отклик сейчас скрывается.
  // Без этого `mutation.isPending` triggers loading-state у ВСЕХ карточек,
  // потому что один TanStack mutation общий для всех откликов.
  const [pendingRejectResponseId, setPendingRejectResponseId] = useState<string | null>(null);
  // Раскрыт ли блок «Скрытые отклики» (по умолчанию свёрнут).
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  // Кнопка «Скрыть» на карточке: confirm → reject_response RPC.
  // Карточка переезжает в collapsible-секцию «Скрытые» внизу.
  const onRejectResponseClick = (responseId: string, masterName: string) => {
    if (pendingRejectResponseId) return;
    Alert.alert(
      "Скрыть этот отклик?",
      `Отклик от «${masterName}» уедет в раздел «Скрытые». Это можно отменить позже, открыв скрытые.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Скрыть",
          style: "destructive",
          onPress: () => {
            setPendingRejectResponseId(responseId);
            rejectResponse.mutate(
              { responseId, orderId },
              {
                onSettled: () => setPendingRejectResponseId(null),
                onError: (e) => Alert.alert("Не удалось скрыть", e.message),
              },
            );
          },
        },
      ],
    );
  };

  const hasResponses = (responses?.length ?? 0) > 0;
  const isOpen = order.status === "open";
  const activeResponses = (responses ?? []).filter((r) => r.status !== "rejected");
  const rejectedResponses = (responses ?? []).filter((r) => r.status === "rejected");

  // Заказ «висит» больше суток без откликов → не обещаем «в течение часа»
  // (это была бы ложь), а даём честную подсказку как привлечь мастеров.
  const orderAgeMs = Date.now() - new Date(order.created_at).getTime();
  const isStaleNoResponses = orderAgeMs > 24 * 60 * 60 * 1000;

  return (
    <View className="mt-8 px-5">
      {/* Heading: «Отклики · N» */}
      <View className="flex-row items-baseline justify-between gap-2">
        <AppText weight="semibold" className="text-title-md text-ink tracking-tight">
          Отклики
        </AppText>
        {hasResponses ? (
          <AppText weight="mono" className="text-mono-caption text-mute">
            {activeResponses.length}
          </AppText>
        ) : null}
      </View>

      {isLoading && (
        <View className="mt-3 -mx-5 border-t border-hairline">
          {[0, 1].map((index) => (
            <View
              key={index}
              className="flex-row items-center gap-3 border-b border-hairline px-5 py-5"
            >
              <Skeleton circle size={48} />
              <View className="flex-1 gap-2">
                <Skeleton width="55%" height={16} />
                <Skeleton width="35%" height={12} />
                <Skeleton width="80%" height={12} />
              </View>
            </View>
          ))}
        </View>
      )}

      {error && (
        <View className="mt-3 rounded-lg bg-canvas-soft p-4">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Не удалось загрузить отклики
          </AppText>
          <AppText className="mt-1 text-body-sm text-error">
            {describeServerError(error, "Не удалось отправить отклик. Попробуйте ещё раз.")}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку откликов"
            disabled={isRefetchingResponses}
            onPress={() => void refetchResponses()}
            className="mt-3 min-h-11 self-start items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-sm text-ink">
              {isRefetchingResponses ? "Загружаем…" : "Повторить"}
            </AppText>
          </Pressable>
        </View>
      )}

      {/* Empty state. Текст зависит от возраста заказа: свежий — оптимистично,
          старше суток без откликов — честно + совет как привлечь мастеров. */}
      {!isLoading && !error && !hasResponses && (
        <View className="mt-3 rounded-xl border border-hairline bg-canvas-soft p-4">
          {isStaleNoResponses ? (
            <>
              <AppText weight="medium" className="text-body-sm text-ink">
                Пока никто не откликнулся
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute">
                Так бывает — спрос на разные услуги разный. Чтобы заявкой заинтересовались,
                попробуйте дополнить описание, добавить фото или указать бюджет. Можно также найти
                исполнителя самому в каталоге.
              </AppText>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Посмотреть специалистов раздела"
                  onPress={() =>
                    router.push({
                      pathname: "/specialists/section",
                      params: { l2: order.l2_id },
                    } as never)
                  }
                  className="min-h-11 items-center justify-center rounded-pill bg-accent px-4 active:opacity-85"
                >
                  <AppText weight="semibold" className="text-body-sm text-on-accent">
                    Специалисты раздела
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Изменить задание"
                  onPress={() => router.push(`/orders/edit/${orderId}` as never)}
                  className="min-h-11 items-center justify-center rounded-pill border border-hairline bg-canvas px-4 active:bg-canvas-soft"
                >
                  <AppText weight="semibold" className="text-body-sm text-ink">
                    Изменить задание
                  </AppText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <AppText weight="medium" className="text-body-sm text-ink">
                Откликов пока нет
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute">
                Уведомим, как только исполнитель отзовётся.
              </AppText>
            </>
          )}
        </View>
      )}

      {/* Активные отклики. */}
      {activeResponses.length > 0 ? (
        <View className="mt-3 -mx-5 border-t border-hairline">
          {activeResponses.map((r) => (
            <ClientMasterResponseCard
              key={r.id}
              response={r}
              isRejecting={pendingRejectResponseId === r.id}
              onReject={
                isOpen
                  ? () => {
                      const masterName =
                        [r.master?.first_name, r.master?.last_name].filter(Boolean).join(" ") ||
                        "исполнителя";
                      onRejectResponseClick(r.id, masterName);
                    }
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}

      {/* Скрытые отклики — collapsible. */}
      {rejectedResponses.length > 0 ? (
        <View className="mt-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => setHiddenExpanded((v) => !v)}
            className="flex-row items-center justify-between rounded-lg border border-hairline bg-canvas-soft px-4 py-3 active:opacity-70"
          >
            <View className="flex-1 flex-row items-center gap-2">
              <AppText weight="medium" className="text-body-sm text-mute">
                Скрытые отклики
              </AppText>
              <View className="rounded-full bg-canvas-soft-2 px-2 py-0.5">
                <AppText weight="mono" className="text-mono-caption text-mute">
                  {rejectedResponses.length}
                </AppText>
              </View>
            </View>
            <CaretRight
              size={16}
              weight="bold"
              color={tc["muted-soft"]}
              style={{
                transform: [{ rotate: hiddenExpanded ? "90deg" : "0deg" }],
              }}
            />
          </Pressable>
          {hiddenExpanded ? (
            <View className="mt-2 -mx-5 border-t border-hairline">
              {rejectedResponses.map((r) => (
                <ClientMasterResponseCard
                  key={r.id}
                  response={r}
                  isRejecting={false}
                  onReject={undefined}
                  rejected
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Master response card (classifieds, 2026-05-20)
//
// Layout:
//   ┌─ Avatar(md) ─ Name ─────────────────────── Price (mono) ─┐
//   │              ⏱ срок (если указан)                       │
//   │              message body (до 4 строк)                   │
//   │     [Позвонить]  [WhatsApp]  [Профиль]                   │
//   │     ─── Не подходит (text-link) ───                      │
//   └──────────────────────────────────────────────────────────┘
//
// Контакты:
//   - Позвонить — Linking.openURL("tel:<phone>"). Phone грузим через RPC
//     get_master_phone (useMasterPhone), он живёт в auth.users.
//   - WhatsApp — Linking.openURL("https://wa.me/<digits>"). Берётся из
//     master_profiles.whatsapp_phone / whatsapp_same_as_phone через
//     useMasterPublicProfile + resolveWhatsappDigits.
//   - Профиль — router.push(`/master/<id>`).
//
// Контакты запрашиваются только после явного тапа клиента. Это не создаёт по
// два сетевых запроса на каждую карточку длинного списка откликов.
// ----------------------------------------------------------------------------

interface ClientMasterResponseCardProps {
  response: OrderResponseWithMaster;
  isRejecting: boolean;
  /** Если undefined — кнопка «Скрыть» не показывается (заказ закрыт /
   *  rejected уже). */
  onReject: (() => void) | undefined;
  /** Render variant: rejected — приглушённый (opacity 0.6) для скрытых. */
  rejected?: boolean;
}

function ClientMasterResponseCard({
  response,
  isRejecting,
  onReject,
  rejected,
}: ClientMasterResponseCardProps) {
  const router = useRouter();
  // Контакты — ЧАСТЬ отклика, а не отдельное действие (DECISION владельца
  // 2026-09-01): мастер отправляет «готов» с ценой, сроком и своими
  // контактами, а клиент связывается сам через WhatsApp или звонок.
  // Раньше здесь стояло false, и телефон подгружался только по нажатию
  // «Показать контакты» — лишний шаг между клиентом и исполнителем.
  //
  // Цена: два запроса на карточку отклика вместо нуля. Измерено на живых
  // данных — в среднем 1.5 отклика на задание, максимум 3, то есть до шести
  // запросов на экран. Приемлемо; если откликов станет много, это надо будет
  // заменить одним пакетным запросом, а не возвращать кнопку.
  // Контакты живут в самом отклике с миграции 0147. Профиль через RPC
  // дёргаем только для старых откликов, у которых в строке контактов нет —
  // так на новых карточках вообще нет лишних запросов.
  const rowPhone = response.contact_phone?.trim() || null;
  const rowWa = response.whatsapp_phone?.trim() || null;
  const rowHasContacts = Boolean(rowPhone || rowWa);
  const [contactsRequested, setContactsRequested] = useState(!rowHasContacts);
  const tc = useThemeColors(["ink", "mute", "warning", "on-primary"]);

  // Рейтинг мастера (общий) — чтобы клиент сравнивал мастеров не только по цене.
  // Показываем только когда есть хотя бы 1 отзыв (паттерн Airbnb/TaskRabbit:
  // у новичка строки рейтинга нет вовсе, а не «Без отзывов»).
  const ratingAvg = response.master?.profile?.rating_overall_avg ?? null;
  const ratingCount = response.master?.profile?.rating_overall_count ?? 0;
  const hasRating = ratingAvg != null && ratingCount > 0;

  // Phone (auth.users) — через RPC get_master_phone. Возвращает null если
  // мастер не активен или у него нет auth.phone.
  const masterPhone = useMasterPhone(contactsRequested ? response.master_id : undefined);
  // WhatsApp (master_profiles) — публично читаемо по RLS.
  const masterPublic = useMasterPublicProfile(contactsRequested ? response.master_id : undefined);

  const phoneRaw = rowHasContacts ? rowPhone : (masterPhone.data ?? null);
  const phoneTel = phoneRaw?.replace(/[^\d+]/g, "") ?? null;
  const phoneWa = rowHasContacts
    ? normalizeWhatsappDigits(rowWa)
    : resolveWhatsappDigits({
        whatsappPhone: masterPublic.data?.master?.whatsapp_phone,
        whatsappSameAsPhone: masterPublic.data?.master?.whatsapp_same_as_phone,
        masterPhone: phoneRaw,
      });
  const contactsError = rowHasContacts ? null : (masterPhone.error ?? masterPublic.error);
  const contactsLoading = rowHasContacts
    ? false
    : masterPhone.isFetching || masterPublic.isFetching;

  const masterName =
    [response.master?.first_name, response.master?.last_name].filter(Boolean).join(" ") ||
    "Исполнитель";
  const priceText = formatResponsePrice(response);
  const isNegotiable = response.price_kind === "negotiable";
  const profileAccessibilityLabel = [
    `Профиль ${masterName}`,
    hasRating ? `Рейтинг ${ratingAvg.toFixed(1)}, отзывов ${ratingCount}` : null,
    priceText,
    response.lead_time ? `Срок ${response.lead_time}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  const onCall = () => {
    if (phoneTel) openExternalUrl(`tel:${phoneTel}`);
  };
  const onWhatsApp = () => {
    if (phoneWa) openExternalUrl(`https://wa.me/${phoneWa}`);
  };
  const onProfile = () => {
    router.push(`/master/${response.master_id}` as never);
  };

  return (
    <View
      className="border-b border-hairline bg-canvas px-5 py-5"
      style={rejected ? { opacity: 0.6 } : undefined}
    >
      {/* Header: avatar + name + price (mono справа). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={profileAccessibilityLabel}
        onPress={onProfile}
        className="flex-row items-center gap-3 active:opacity-70"
      >
        <Avatar
          url={response.master?.avatar_url ?? null}
          name={masterName}
          seed={response.master?.id ?? response.master_id}
          size="md"
        />
        <View className="flex-1 min-w-0">
          <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
            {masterName}
          </AppText>
          {hasRating ? (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Star size={12} weight="fill" color={tc.warning} />
              <AppText weight="semibold" className="text-caption text-ink">
                {ratingAvg.toFixed(1)}
              </AppText>
              <AppText className="text-caption text-mute">({ratingCount})</AppText>
            </View>
          ) : null}
          {response.lead_time ? (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Clock size={12} weight="bold" color={tc.mute} />
              <AppText className="text-caption text-mute" numberOfLines={1}>
                {response.lead_time}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText
          weight={isNegotiable ? "semibold" : "mono"}
          className={`${isNegotiable ? "text-body-md" : "text-title-md"} text-ink`}
        >
          {priceText}
        </AppText>
      </Pressable>

      {/* Сообщение мастера. */}
      {response.message ? (
        <AppText
          className="mt-3 text-body-sm text-body"
          style={{ lineHeight: 20 }}
          numberOfLines={6}
        >
          {response.message}
        </AppText>
      ) : null}

      {/* Status hint для rejected. */}
      {rejected ? (
        <AppText weight="medium" className="mt-2 text-caption text-muted-soft">
          Скрыто
        </AppText>
      ) : null}

      {/* Контакт-кнопки. В скрытых не показываем. */}
      {!rejected ? (
        <View className="mt-4 gap-2">
          <View className="flex-row gap-2">
            {!contactsRequested ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Показать контакты исполнителя ${masterName}`}
                onPress={() => setContactsRequested(true)}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-pill bg-ink active:opacity-85"
              >
                <Phone size={16} weight="bold" color={tc["on-primary"]} />
                <AppText weight="semibold" className="text-button-sm text-on-primary">
                  Показать контакты
                </AppText>
              </Pressable>
            ) : contactsError ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Повторить загрузку контактов"
                disabled={contactsLoading}
                onPress={() => {
                  void Promise.all([masterPhone.refetch(), masterPublic.refetch()]);
                }}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-pill border border-error bg-canvas active:bg-canvas-soft"
              >
                {contactsLoading ? (
                  <ActivityIndicator size="small" color={tc.mute} />
                ) : (
                  <>
                    <ArrowCounterClockwise size={16} weight="bold" color={tc.ink} />
                    <AppText weight="semibold" className="text-button-sm text-ink">
                      Повторить контакты
                    </AppText>
                  </>
                )}
              </Pressable>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Позвонить исполнителю"
                  disabled={!phoneTel}
                  onPress={onCall}
                  className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-pill ${
                    phoneTel ? "bg-ink active:opacity-85" : "bg-canvas-soft-2"
                  }`}
                >
                  {phoneTel ? (
                    <>
                      <Phone size={16} weight="bold" color={tc["on-primary"]} />
                      <AppText weight="semibold" className="text-button-sm text-on-primary">
                        Позвонить
                      </AppText>
                    </>
                  ) : contactsLoading ? (
                    <ActivityIndicator size="small" color={tc.mute} />
                  ) : (
                    <AppText weight="medium" className="text-button-sm text-mute">
                      Нет номера
                    </AppText>
                  )}
                </Pressable>

                {phoneWa ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Написать в WhatsApp"
                    onPress={onWhatsApp}
                    className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
                  >
                    <WhatsappLogo size={16} weight="bold" color={tc.ink} />
                    <AppText weight="semibold" className="text-button-sm text-ink">
                      WhatsApp
                    </AppText>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Открыть профиль ${masterName}`}
            onPress={onProfile}
            className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
          >
            <CaretRight size={16} weight="bold" color={tc.ink} />
            <AppText weight="semibold" className="text-button-sm text-ink">
              Профиль
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {/* «Скрыть» — тихое действие под контактами. */}
      {onReject ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Скрыть отклик"
          onPress={onReject}
          disabled={isRejecting}
          hitSlop={6}
          className="mt-3 items-center active:opacity-60"
        >
          {isRejecting ? (
            <ActivityIndicator size="small" color={tc.mute} />
          ) : (
            <AppText weight="medium" className="text-caption text-muted-soft">
              Скрыть
            </AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function formatResponsePrice(r: Tables<"order_responses">): string {
  // Делегирует общему форматтеру из order-schema. «Цена договорная» → «Договорная»
  // короткая (для inline-меты в карточке отклика).
  if (r.price_kind === "negotiable") return "Договорная";
  return formatPrice(r.price_kind, r.price_value);
}

// ============================================================================
// Master response section — мой отправленный отклик (карточка со статусом и
// «Отозвать»). Сама форма отклика живёт в шторке /orders/respond (DECISION
// владельца 2026-09-07: отклик отделён от задания). Если отклика нет или он
// отозван — секция пустая, кнопка «Откликнуться» плавает внизу экрана.
// ============================================================================

interface MasterResponseSectionProps {
  orderId: string;
  masterId: string;
  orderStatus: Tables<"orders">["status"];
  pickedMasterId: string | null;
}

function MasterResponseSection({
  orderId,
  masterId,
  orderStatus,
  pickedMasterId,
}: MasterResponseSectionProps) {
  const { data: myResponse } = useMyResponseForOrder(orderId, masterId);
  const withdrawResponse = useWithdrawResponse();
  const tc = useThemeColors(["accent", "success", "mute"]);
  if (!myResponse || (myResponse.status === "withdrawn" && orderStatus === "open")) return null;

  const isPickedMaster = pickedMasterId === masterId;
  const canWithdraw =
    orderStatus === "open" && (myResponse.status === "sent" || myResponse.status === "viewed");
  const onWithdrawPress = async () => {
    if (withdrawResponse.isPending) return;
    const confirmed = await confirmAsync({
      title: "Отозвать отклик?",
      message: "Клиент получит уведомление. Позже можно откликнуться снова.",
      confirmText: "Отозвать",
      cancelText: "Отмена",
    });
    if (!confirmed) return;
    withdrawResponse.mutate(
      { responseId: myResponse.id, orderId, masterId },
      {
        onSuccess: () => hapticSuccess(),
        onError: (e) =>
          Alert.alert("Не удалось отозвать", describeServerError(e, "Попробуйте ещё раз.")),
      },
    );
  };

  return (
    <View className="mt-8">
      <InsetGroup
        title="Ваш отклик"
        footer={
          isPickedMaster
            ? "Клиент выбрал вас. Свяжитесь с ним по контактам в задании."
            : "Клиент видит ваш отклик и свяжется сам, если выберет вас."
        }
      >
        <InsetRow
          title={formatResponsePrice(myResponse)}
          subtitle={[
            myResponse.lead_time ? `Срок: ${myResponse.lead_time}` : "",
            myResponse.message ?? "",
          ]
            .filter(Boolean)
            .join(" · ")}
          value={responseStatusLabel(myResponse.status)}
          icon={
            <SystemIcon
              sf={isPickedMaster ? "checkmark.seal.fill" : "paperplane.fill"}
              fallback={isPickedMaster ? CheckCircle : PaperPlaneTilt}
              size={18}
              weight="regular"
              color={isPickedMaster ? tc.success : tc.accent}
            />
          }
          last={!canWithdraw}
        />
        {canWithdraw ? (
          <InsetRow
            title={withdrawResponse.isPending ? "Отзываем…" : "Отозвать отклик"}
            destructive
            onPress={() => void onWithdrawPress()}
            disabled={withdrawResponse.isPending}
            last
          />
        ) : null}
      </InsetGroup>
    </View>
  );
}

function responseStatusLabel(s: Tables<"order_responses">["status"]): string {
  switch (s) {
    case "sent":
      return "Отклик отправлен";
    case "viewed":
      return "Клиент прочитал";
    case "accepted":
      // В модели доски объявлений клиент не «выбирает» мастера в приложении —
      // он связывается напрямую. Поэтому нейтральный «Отклик активен», а не
      // ложное «клиент выбрал вас».
      return "Отклик активен";
    case "rejected":
      return "Клиент отклонил";
    case "withdrawn":
      return "Отклик отозван";
  }
}
