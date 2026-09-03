import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowCounterClockwise,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  DotsThree,
  MapPin,
  Phone,
  Star,
  Users,
  Wallet,
  WhatsappLogo,
  X,
} from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { ScreenHeader, Skeleton } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { digitsOnly, normalizePhone } from "@/features/auth/validation";
import { blockConfirmMessage, blockSuccessMessage } from "@/features/blocking/blocking-copy";
import { blockingActionFailureMessage } from "@/features/blocking/blocking-error-message";
import { useBlockUser } from "@/features/blocking/use-user-blocks";
import { useMasterPhone, useMasterPublicProfile } from "@/features/master-view/use-master-public";
import { useCloseReasonPickerStore } from "@/features/orders/close-reason-picker-store";
import { OrderPhotoCarousel } from "@/features/orders/OrderPhotoCarousel";
import {
  formatOrderTiming,
  formatPrice,
  orderPriceKindOptions,
  priceKindLabel,
} from "@/features/orders/order-schema";
import {
  type ResponseFormValues,
  responseFormSchema,
} from "@/features/orders/response-form-schema";
import { type CancelReason, useCancelOrder } from "@/features/orders/use-cancel-order";
import { useDeleteOrder } from "@/features/orders/use-delete-order";
import { type OrderDetail, useOrderDetail } from "@/features/orders/use-order-detail";
import {
  type OrderResponseWithMaster,
  useMyResponseForOrder,
  useOrderResponses,
  useSubmitResponse,
} from "@/features/orders/use-order-responses";
import { useRejectResponse } from "@/features/orders/use-reject-response";
import { canReopenOrder, useReopenOrder } from "@/features/orders/use-reopen-order";
import { isDailyLimitError, useResponseLimit } from "@/features/orders/use-response-limit";
import { useMarkResponsesViewed } from "@/features/orders/use-unread-responses";
import { useWithdrawResponse } from "@/features/orders/use-withdraw-response";
import { ReportModal } from "@/features/reports/ReportModal";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { confirmAsync } from "@/lib/confirm";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { openExternalUrl } from "@/lib/open-link";
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
    (reason: CancelReason) => {
      if (!id || !userId) return;
      cancelOrder.mutate(
        { orderId: id, clientId: userId, reason },
        { onError: (e) => Alert.alert("Не удалось закрыть", e.message) },
      );
    },
    [id, userId, cancelOrder],
  );

  useEffect(() => {
    if (!closeReasonResult || closeReasonResult.orderId !== id) return;
    handleCloseWithReason(closeReasonResult.reason);
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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

          {isOwner && id && order && <ClientResponsesSection orderId={id} order={order} />}
          {/* Откликнуться может любой аккаунт, кроме автора задания
              (DECISION владельца 2026-09-01). Раньше форма показывалась
              только в «режиме мастера», и человеку приходилось сначала
              переключаться — три разные карточки-подсказки ниже существовали
              ровно ради этого перехода. */}
          {!isOwner && userId && id && (
            <MasterResponseSection
              orderId={id}
              masterId={userId}
              l2Id={order.l2_id}
              orderStatus={order.status}
              pickedMasterId={order.picked_master_id}
            />
          )}
        </ScrollView>
      )}

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
    <View className="mt-6 mx-5 rounded-xl border border-accent bg-accent-soft p-4 flex-row items-start gap-3">
      <CheckCircle size={22} weight="fill" color={tc.accent} />
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink">
          Уже нашли исполнителя?
        </AppText>
        <AppText className="mt-1 text-body-sm text-body">
          Закройте задание — исполнители перестанут отправлять отклики.
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
          <AppText className="mt-1 text-caption text-error">{error.message}</AppText>
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
// Master response section — мастер шлёт отклик или видит свой существующий
// ============================================================================

interface MasterResponseSectionProps {
  orderId: string;
  masterId: string;
  l2Id: string;
  orderStatus: Tables<"orders">["status"];
  pickedMasterId: string | null;
}

function MasterResponseSection({
  orderId,
  masterId,
  l2Id,
  orderStatus,
  pickedMasterId,
}: MasterResponseSectionProps) {
  const { data: myResponse, isLoading } = useMyResponseForOrder(orderId, masterId);
  const submitResponse = useSubmitResponse();
  const withdrawResponse = useWithdrawResponse();
  // P0-5: дневной лимит откликов (5/день). Не блокируем UI, но блокируем
  // submit + показываем понятное сообщение если лимит исчерпан.
  const { data: responseLimit } = useResponseLimit();
  const tc = useThemeColors(["muted-soft", "mute", "ink", "error", "on-primary", "on-accent"]);

  const isPickedMaster = pickedMasterId === masterId;
  const orderClosed = orderStatus !== "open";

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isValid },
  } = useForm<ResponseFormValues>({
    resolver: zodResolver(responseFormSchema),
    defaultValues: {
      message: "",
      priceKind: "negotiable",
      priceValue: null,
      leadTime: "",
      contactPhone: "",
      whatsappPhone: "",
    },
    mode: "onChange",
  });

  // Контакты подставляем из профиля, если они там есть, — человеку остаётся
  // только подтвердить. Подставляем один раз и только в пустое поле: то, что
  // он уже начал вводить, не затираем.
  const { data: me } = useUserRecord(masterId);
  const myPublic = useMasterPublicProfile(masterId);
  useEffect(() => {
    const phone = me?.contact_phone?.trim();
    if (phone && !getValues("contactPhone")) {
      setValue("contactPhone", phone, { shouldValidate: true });
    }
    const wa = myPublic.data?.master?.whatsapp_phone?.trim();
    if (wa && !getValues("whatsappPhone")) {
      setValue("whatsappPhone", wa, { shouldValidate: true });
    }
  }, [me?.contact_phone, myPublic.data?.master?.whatsapp_phone, getValues, setValue]);

  const priceKind = watch("priceKind");
  const isBusy = submitResponse.isPending;
  // P0-5: исчерпан ли лимит откликов сегодня?
  const limitReached = (responseLimit?.remaining ?? 5) <= 0;
  const submitError = submitResponse.error?.message;
  const limitError = isDailyLimitError(submitResponse.error);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await submitResponse.mutateAsync({
        orderId,
        masterId,
        l2Id,
        priceKind: values.priceKind,
        priceValue: values.priceValue,
        leadTime: values.leadTime,
        message: values.message,
        contactPhone:
          digitsOnly(values.contactPhone).length >= 10 ? normalizePhone(values.contactPhone) : null,
        whatsappPhone:
          digitsOnly(values.whatsappPhone).length >= 10
            ? normalizePhone(values.whatsappPhone)
            : null,
      });
      hapticSuccess();
    } catch (_e) {
      // текст ошибки — через submitError, haptic не единственный сигнал
      hapticError();
    }
  });

  if (isLoading) {
    return (
      <View className="mt-10 px-5">
        <Skeleton width={110} height={14} style={{ borderRadius: 4 }} />
        <View className="mt-4 rounded-2xl border border-hairline p-4">
          <View className="flex-row items-center gap-3">
            <Skeleton width={48} height={48} style={{ borderRadius: 24 }} />
            <View className="flex-1 gap-2">
              <Skeleton width="55%" height={16} style={{ borderRadius: 4 }} />
              <Skeleton width="35%" height={12} style={{ borderRadius: 4 }} />
            </View>
          </View>
          <View className="mt-4 gap-2">
            <Skeleton width="100%" height={14} style={{ borderRadius: 4 }} />
            <Skeleton width="78%" height={14} style={{ borderRadius: 4 }} />
          </View>
        </View>
      </View>
    );
  }

  // Уже есть отклик — показываем статус
  if (myResponse) {
    const accentClass = isPickedMaster
      ? "border-success bg-success-soft"
      : "border-accent bg-accent-soft";
    const textColor = isPickedMaster ? "text-success" : "text-accent";

    // T15: можно отозвать пока response в sent/viewed (до accept).
    const canWithdraw =
      orderStatus === "open" && (myResponse.status === "sent" || myResponse.status === "viewed");
    const isBusyWithdraw = withdrawResponse.isPending;

    const onWithdrawPress = async () => {
      if (isBusyWithdraw) return;
      const confirmed = await confirmAsync({
        title: "Отозвать отклик?",
        // Прежний текст обещал «можно создать новый». База это запрещает:
        // UNIQUE(order_id, master_id) остаётся после отзыва, строка не
        // удаляется, и форма больше не возвращается. Интерфейс не должен
        // обещать того, чего продукт не делает.
        message: "Клиент получит уведомление. Откликнуться на это задание снова будет нельзя.",
        confirmText: "Отозвать",
        cancelText: "Отмена",
      });
      if (!confirmed) return;
      withdrawResponse.mutate(
        { responseId: myResponse.id, orderId, masterId },
        {
          onSuccess: () => hapticSuccess(),
          onError: () => hapticError(),
        },
      );
    };

    // Минимализм 2026-05-16: убрана дублирующая строка «Клиент выбрал вас 🎉»
    // (для isPickedMaster). Когда мастера уже выбрали — status «В работе» в
    // header заказа + primary CTA «Работа выполнена» снизу уже сигналят это.
    // Третий раз сообщать с emoji — шум. Border нейтральный (hairline) для
    // isPickedMaster, accent остаётся для pending status'ов.
    return (
      <View className="mt-10 px-5">
        {/* Секция-лейбл «ВАШ ОТКЛИК» + линия (Linear-референс). */}
        <View className="flex-row items-center gap-3">
          <AppText
            weight="medium"
            className="text-caption uppercase text-mute"
            style={{ letterSpacing: 1 }}
          >
            Ваш отклик
          </AppText>
          <View className="h-px flex-1 bg-hairline" />
        </View>
        <View
          className={`mt-4 rounded-2xl border ${
            isPickedMaster ? "border-hairline bg-canvas-soft" : accentClass
          } p-4`}
        >
          {!isPickedMaster && (
            <AppText weight="semibold" className={`text-body-md ${textColor}`}>
              {responseStatusLabel(myResponse.status)}
            </AppText>
          )}
          <AppText
            weight="mono"
            className={`${isPickedMaster ? "" : "mt-2 "}text-title-md text-ink`}
          >
            {formatResponsePrice(myResponse)}
          </AppText>
          {myResponse.lead_time && (
            <AppText className="mt-1 text-caption text-muted">Срок: {myResponse.lead_time}</AppText>
          )}
          <AppText className="mt-2 text-body-sm text-body">{myResponse.message}</AppText>
        </View>
        {canWithdraw ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отозвать отклик"
            disabled={isBusyWithdraw}
            onPress={onWithdrawPress}
            className="mt-3 min-h-12 flex-row items-center justify-center gap-2 rounded-xl border border-hairline bg-canvas active:bg-canvas-soft"
          >
            <X size={16} weight="bold" color={tc.ink} />
            <AppText weight="medium" className="text-button-sm text-ink">
              {isBusyWithdraw ? "Отзываем..." : "Отозвать отклик"}
            </AppText>
          </Pressable>
        ) : null}
        {withdrawResponse.error && (
          <AppText weight="medium" className="mt-2 text-caption text-error">
            {withdrawResponse.error.message}
          </AppText>
        )}
      </View>
    );
  }

  // Заказ закрыт (in_progress/completed/cancelled/expired), мастер не откликался
  // → CTA отключён. В модели доски объявлений клиент НЕ «выбирает мастера» в
  // приложении — он просто закрывает заказ, когда нашёл исполнителя. Поэтому
  // текст нейтральный, без ложного «клиент выбрал мастера».
  if (orderClosed) {
    return (
      <View className="mt-10 px-6">
        <View className="rounded-lg bg-surface-2 p-4">
          <AppText weight="medium" className="text-body-sm text-muted">
            Задание закрыто — отклики больше не принимаются.
          </AppText>
        </View>
      </View>
    );
  }

  // Форма отклика
  //
  // 2026-05-20 — визуально отделили блок «Ваш отклик» от деталей заказа.
  // Раньше форма шла плоско под автор-карточкой и сливалась с контентом
  // выше: мастер не сразу понимал, что «вот тут моё действие».
  //
  // Решение — Linear/Vercel/Stripe гибрид:
  //   1) full-width hairline-divider (через negative margins пересекает
  //      external padding ScrollView'а),
  //   2) eyebrow-label сверху в caps + tracking-wider («ВАШ ОТКЛИК») —
  //      перекликается с подписью «ЗАКАЗЧИК» на карточке клиента → визуально
  //      связывает обе секции в одну ритмику,
  //   3) короткий, самоочевидный H1 «Откликнуться на заказ» (без
  //      подзаголовка — правило §G design-quality.md),
  //   4) форма остаётся плоско на canvas, без обёртки в bg-canvas-soft —
  //      иначе получится «карточка-в-карточке» (matrёшка-anti-pattern с
  //      авторской карточкой выше).
  //
  // Lazyweb-источники: Stripe (caps section labels), Linear (hairline +
  // воздух между секциями), Depop «Make an offer» (компактный self-contained
  // блок без вложенных боксов). Profi.ru и Thumbtack по этому паттерну делают
  // отдельную карточку — осознанно НЕ повторяем, чтобы избежать matрёшки.
  const canSubmit = isValid && !isBusy && !limitReached;
  return (
    <View className="mt-10 px-5">
      {/* Секция-лейбл «ВАШ ОТКЛИК» + линия (Linear-референс). */}
      <View className="flex-row items-center gap-3">
        <AppText
          weight="medium"
          className="text-caption uppercase text-mute"
          style={{ letterSpacing: 1 }}
        >
          Ваш отклик
        </AppText>
        <View className="h-px flex-1 bg-hairline" />
      </View>

      {/* Карточка формы — белая, скруглённая (Linear). Цена / Срок / Сообщение
          разделены тонкими линиями. */}
      <View className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-canvas">
        {/* Цена — крупное поле с подчёркиванием + чипы режима. */}
        <View className="p-5">
          <AppText weight="medium" className="text-body-sm text-ink">
            Ваша цена
          </AppText>
          <Controller
            control={control}
            name="priceValue"
            render={({ field: { value, onChange, onBlur } }) => {
              const negotiable = priceKind === "negotiable";
              return (
                <View>
                  <View
                    className={`mt-3 flex-row items-baseline gap-2 border-b pb-2 ${
                      errors.priceValue
                        ? "border-error"
                        : !negotiable && value != null
                          ? "border-hairline-strong"
                          : "border-hairline"
                    }`}
                  >
                    <TextInput
                      accessibilityLabel="Сумма отклика в рублях"
                      accessibilityHint={
                        negotiable ? "Сумма не требуется" : "Введите целую положительную сумму"
                      }
                      value={negotiable || value == null ? "" : String(value)}
                      onBlur={onBlur}
                      onChangeText={(raw) => {
                        const cleaned = raw.replace(/\D/g, "");
                        onChange(cleaned === "" ? null : Number.parseInt(cleaned, 10));
                      }}
                      editable={!negotiable && !isBusy}
                      placeholder={
                        negotiable
                          ? "Договорная"
                          : priceKind === "from"
                            ? "От суммы"
                            : priceKind === "up_to"
                              ? "До суммы"
                              : "20 000"
                      }
                      placeholderTextColor={tc["muted-soft"]}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      className={`flex-1 ${negotiable ? "text-muted-soft" : "text-ink"}`}
                      style={{
                        paddingVertical: 2,
                        fontSize: 28,
                        fontWeight: "700",
                        letterSpacing: -0.5,
                        fontVariant: ["tabular-nums"],
                      }}
                    />
                    <AppText className="text-title-md text-mute">₽</AppText>
                  </View>
                  {errors.priceValue ? (
                    <AppText
                      accessibilityLiveRegion="polite"
                      weight="medium"
                      className="mt-2 text-caption text-error"
                    >
                      {errors.priceValue.message}
                    </AppText>
                  ) : null}
                </View>
              );
            }}
          />
          <Controller
            control={control}
            name="priceKind"
            render={({ field: { value, onChange } }) => (
              <View className="mt-4 flex-row flex-wrap gap-2">
                {orderPriceKindOptions.map((k) => {
                  const selected = value === k;
                  return (
                    <Pressable
                      key={k}
                      accessibilityRole="radio"
                      accessibilityLabel={`Тип цены: ${priceKindLabel(k)}`}
                      accessibilityState={{ selected }}
                      disabled={isBusy}
                      onPress={() => onChange(k)}
                      className={`h-11 items-center justify-center rounded-md border px-3 ${
                        selected
                          ? "border-accent bg-accent-soft"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-caption ${selected ? "text-accent" : "text-body"}`}
                      >
                        {priceKindLabel(k)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
        </View>

        <View className="h-px bg-hairline" />

        {/* Срок — обязателен с 2026-09-01 */}
        <View className="p-5">
          <Controller
            control={control}
            name="leadTime"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="medium" className="text-body-sm text-ink">
                  Когда сможете взяться
                </AppText>
                <TextInput
                  accessibilityLabel="Срок выполнения"
                  accessibilityHint="Обязательное поле"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Завтра / 2–3 дня / на следующей неделе"
                  placeholderTextColor={tc["muted-soft"]}
                  maxLength={100}
                  className={`mt-2 border-b pb-2 text-body-md text-ink ${
                    value ? "border-hairline-strong" : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
              </View>
            )}
          />
        </View>

        <View className="h-px bg-hairline" />

        {/* Контакты — уходят вместе с откликом (DECISION владельца 2026-09-02).
            Каждый по желанию, но хотя бы один обязателен: клиенту нужно
            куда-то написать. Подставляются из профиля, если там есть. */}
        <View className="p-5 gap-4">
          <Controller
            control={control}
            name="contactPhone"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="medium" className="text-body-sm text-ink">
                  Телефон для связи
                </AppText>
                <TextInput
                  accessibilityLabel="Телефон для связи"
                  accessibilityHint="Нужен телефон или WhatsApp, хотя бы один"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="+7 928 000-00-00"
                  placeholderTextColor={tc["muted-soft"]}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  maxLength={32}
                  className={`mt-2 border-b pb-2 text-body-md text-ink ${
                    errors.contactPhone
                      ? "border-error"
                      : value
                        ? "border-hairline-strong"
                        : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
                {errors.contactPhone ? (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.contactPhone.message}
                  </AppText>
                ) : null}
              </View>
            )}
          />
          <Controller
            control={control}
            name="whatsappPhone"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="medium" className="text-body-sm text-ink">
                  WhatsApp
                </AppText>
                <TextInput
                  accessibilityLabel="Номер WhatsApp"
                  accessibilityHint="Нужен телефон или WhatsApp, хотя бы один"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Если отличается от телефона"
                  placeholderTextColor={tc["muted-soft"]}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={32}
                  className={`mt-2 border-b pb-2 text-body-md text-ink ${
                    errors.whatsappPhone
                      ? "border-error"
                      : value
                        ? "border-hairline-strong"
                        : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
                {errors.whatsappPhone ? (
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.whatsappPhone.message}
                  </AppText>
                ) : null}
              </View>
            )}
          />
        </View>

        <View className="h-px bg-hairline" />

        {/* Сообщение клиенту */}
        <View className="p-5">
          <Controller
            control={control}
            name="message"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="medium" className="text-body-sm text-ink">
                  Сообщение клиенту — если хотите
                </AppText>
                <TextInput
                  accessibilityLabel="Сообщение заказчику"
                  accessibilityHint="Необязательно, до 1000 символов"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Например: делал такое, есть свой инструмент"
                  placeholderTextColor={tc["muted-soft"]}
                  multiline
                  numberOfLines={4}
                  maxLength={1000}
                  textAlignVertical="top"
                  className={`mt-2 min-h-24 border-b pb-2 text-body-md text-ink ${
                    errors.message
                      ? "border-error"
                      : value
                        ? "border-hairline-strong"
                        : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
                {errors.message && (
                  <AppText
                    accessibilityLiveRegion="polite"
                    weight="medium"
                    className="mt-2 text-caption text-error"
                  >
                    {errors.message.message}
                  </AppText>
                )}
              </View>
            )}
          />
        </View>
      </View>

      {limitReached && (
        <View
          accessibilityLiveRegion="polite"
          className="mt-4 rounded-xl border border-hairline bg-canvas-soft p-3"
        >
          <AppText weight="semibold" className="text-body-sm text-ink">
            Лимит откликов на сегодня исчерпан
          </AppText>
          <AppText className="mt-1 text-caption text-muted">
            Вы отправили {responseLimit?.used ?? 5} из {responseLimit?.max ?? 5} откликов. Завтра в
            00:00 (МСК) появятся новые.
          </AppText>
        </View>
      )}
      {submitError && !limitReached && (
        <AppText
          accessibilityLiveRegion="polite"
          weight="medium"
          className="mt-3 text-caption text-error"
        >
          {limitError
            ? "Лимит откликов на сегодня исчерпан — попробуйте завтра."
            : `Не удалось отправить отклик. ${submitError}`}
        </AppText>
      )}

      {/* Кнопка отклика — акцентная (DECISION владельца 2026-09-02 «кнопка
          цветнее»), контент белый через токен on-accent (DECISION 2026-09-03).
          Цена по контрасту — в src/lib/colors.ts. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Отправить отклик"
        accessibilityHint="Цена, срок и контакты будут отправлены заказчику"
        disabled={!canSubmit}
        onPress={onSubmit}
        className={`mt-4 h-12 flex-row items-center justify-center gap-2 rounded-xl ${
          canSubmit ? "bg-accent active:opacity-85" : "bg-surface-3"
        }`}
      >
        {canSubmit ? <Check size={18} weight="bold" color={tc["on-accent"]} /> : null}
        <AppText
          weight="semibold"
          className={`text-button ${canSubmit ? "text-on-accent" : "text-muted-soft"}`}
        >
          {limitReached ? "Лимит исчерпан" : isBusy ? "Отправляем…" : "Откликнуться"}
        </AppText>
      </Pressable>
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
