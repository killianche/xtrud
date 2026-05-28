import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowCounterClockwise,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  Flag,
  MapPin,
  DotsThree,
  Pencil,
  Phone,
  Trash,
  WhatsappLogo,
  X,
} from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
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
import { openExternalUrl } from "@/lib/open-link";
import { z } from "zod";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useSetActiveRole } from "@/features/auth/use-set-active-role";
import { useUserRecord } from "@/features/auth/use-user-record";
import { BottomSheet, ScreenHeader } from "@/components/ui";
import { OrderPhotoCarousel } from "@/features/orders/OrderPhotoCarousel";
import { useRejectResponse } from "@/features/orders/use-reject-response";
import {
  formatPrice,
  orderPriceKindOptions,
  priceKindLabel,
  urgencyLabel,
} from "@/features/orders/order-schema";
import { type CancelReason, useCancelOrder } from "@/features/orders/use-cancel-order";
import { useDeleteOrder } from "@/features/orders/use-delete-order";
import { canReopenOrder, useReopenOrder } from "@/features/orders/use-reopen-order";
import { useWithdrawResponse } from "@/features/orders/use-withdraw-response";
import { type OrderDetail, useOrderDetail } from "@/features/orders/use-order-detail";
import {
  type OrderResponseWithMaster,
  useMyResponseForOrder,
  useOrderResponses,
  useSubmitResponse,
} from "@/features/orders/use-order-responses";
import {
  useMasterPhone,
  useMasterPublicProfile,
} from "@/features/master-view/use-master-public";
import {
  isDailyLimitError,
  useResponseLimit,
} from "@/features/orders/use-response-limit";
import { useMarkResponsesViewed } from "@/features/orders/use-unread-responses";
import { ReportModal } from "@/features/reports/ReportModal";
import { useColorScheme, useDomColorScheme } from "@/hooks/use-color-scheme";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { darkColors, lightColors } from "@/lib/colors";
import { confirmAsync } from "@/lib/confirm";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import { resolveWhatsappDigits } from "@/lib/whatsapp";
import type { Database, Tables } from "@/types/database";

// ============================================================================
// Response form schema (для мастера)
// ============================================================================

const responseSchema = z.object({
  message: z.string().min(10, "Минимум 10 символов").max(1000, "Максимум 1000 символов"),
  priceKind: z.enum(orderPriceKindOptions),
  priceValue: z.number().int().min(0).nullable(),
  leadTime: z.string().max(100, "Максимум 100 символов"),
});

type ResponseFormValues = z.infer<typeof responseSchema>;

// ============================================================================
// Main
// ============================================================================

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const { data: order, isLoading, error } = useOrderDetail(id);

  const isOwner = !!userId && !!order && order.client_id === userId;
  const isMasterRole = user?.active_role === "master";

  // Если dual-role-пользователь сейчас в client-режиме смотрит чужой заказ, на
  // который уже откликался КАК МАСТЕР — показываем «Вы откликнулись» badge с
  // переключением в master-режим, вместо CTA «откликнуться» (нельзя
  // откликаться дважды на один и тот же заказ — фидбэк владельца 2026-05-27).
  // Запрашиваем только когда есть смысл (is_master + chase в client-режиме на
  // чужом заказе) — иначе тратили бы запрос на каждом просмотре.
  const shouldCheckMyResponse =
    !!user?.is_master && !isMasterRole && !isOwner && !!userId && !!id;
  const myMasterResponseQ = useMyResponseForOrder(
    shouldCheckMyResponse ? id : undefined,
    shouldCheckMyResponse ? userId : undefined,
  );
  const hasMyMasterResponse = !!myMasterResponseQ.data;
  const tc = useThemeColors(["ink", "muted-soft", "body", "mute"]);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Шит выбора причины закрытия заказа («нашёл мастера» / «больше не нужно»).
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);

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

  // Заказ закрыт клиентом или истёк → доступны «Удалить» / «Открыть заново».
  const isClosedHistory =
    !!order && (order.status === "cancelled" || order.status === "expired");
  const canReopen = !!order && canReopenOrder(order.status, order.updated_at);

  // Закрытие заказа с выбранной причиной. Вызывается из CloseReasonSheet.
  const handleCloseWithReason = (reason: CancelReason) => {
    if (!id || !userId) return;
    setCloseSheetOpen(false);
    cancelOrder.mutate(
      { orderId: id, clientId: userId, reason },
      { onError: (e) => Alert.alert("Не удалось закрыть", e.message) },
    );
  };

  // Удаление заказа из «Истории». Подтверждение через confirmAsync
  // (работает и на вебе, в отличие от Alert.alert). После удаления уходим назад.
  const handleDelete = async () => {
    if (!id || !userId) return;
    setMenuOpen(false);
    const confirmed = await confirmAsync({
      title: "Удалить заказ?",
      message:
        "Заказ исчезнет из «Моих заказов» навсегда вместе с откликами. Это нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!confirmed) return;
    deleteOrder.mutate(
      { orderId: id, clientId: userId },
      {
        onSuccess: () => goBack(),
        onError: (e) => Alert.alert("Не удалось удалить", e.message),
      },
    );
  };

  // Открыть заново — возвращает заказ в ленту мастеров (+14 дней).
  const handleReopen = () => {
    if (!id || !userId) return;
    setMenuOpen(false);
    reopenOrder.mutate(
      { orderId: id, userId },
      { onError: (e) => Alert.alert("Не удалось открыть заново", e.message) },
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
                onPress: () => setMenuOpen(true),
                accessibilityLabel: "Действия с заказом",
              }
            : undefined
        }
      />

      {isLoading && (
        <View className="mt-8 items-center px-6">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить заказ. {error.message}
          </AppText>
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
              onCloseRequested={() => setCloseSheetOpen(true)}
            />
          ) : null}

          {isOwner && id && order && (
            <ClientResponsesSection orderId={id} order={order} />
          )}
          {!isOwner && isMasterRole && userId && id && (
            <MasterResponseSection
              orderId={id}
              masterId={userId}
              l2Id={order.l2_id}
              orderStatus={order.status}
              pickedMasterId={order.picked_master_id}
            />
          )}
          {/* Sprint 2026-05-20: клиент-визитёр на чужом заказе.
              Логика по ветвям:
              - is_master=true (dual-role, сейчас в режиме клиента) → быстро
                переключиться в master-режим и сразу увидеть MasterResponseSection.
                Никакого онбординга, просто one-tap switch.
              - is_master=false (чистый клиент) → CTA «Стать мастером»,
                запоминаем return-URL, отправляем на онбординг мастера. После
                finalize_master_onboarding() возврат на этот же заказ. */}
          {!isOwner && !isMasterRole && id && order.status === "open" ? (
            user?.is_master && userId ? (
              hasMyMasterResponse ? (
                // Уже откликался как мастер — не CTA, а статус с переходом к
                // своему отклику (через переключение роли).
                <MyResponseBadgeCTA userId={userId} />
              ) : (
                <SwitchToMasterCTA userId={userId} />
              )
            ) : (
              <BecomeMasterCTA orderId={id} />
            )
          ) : null}
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

      {/* Action menu — bottom-sheet с действиями по заказу. Заменяет россыпь
          круглых icon-buttons в шапке, чтобы не путать с status-pill.
          Набор действий зависит от статуса (план §3 «состояние → действия»):
            open:               Редактировать, Закрыть заказ
            cancelled/expired:  Открыть заново (в окне 7 дней), Удалить
            чужой заказ:        Пожаловаться */}
      {order && id && userId ? (
        <BottomSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title="Действия с заказом"
        >
          {/* Группировка (план §3 «состояние → действия»): сначала
              «безопасные» действия (редактировать / открыть заново / закрыть),
              затем — после тонкого разделителя — необратимое «Удалить» красным.
              Это паттерн iOS action-sheet: деструктив отделён и визуально
              выделен, чтобы не нажать случайно. */}
          <View className="gap-0.5 px-2 pb-2">
            {isOwner && order.status === "open" ? (
              <ActionMenuItem
                icon={Pencil}
                label="Редактировать заказ"
                onPress={() => {
                  setMenuOpen(false);
                  router.push(`/orders/edit/${id}` as never);
                }}
              />
            ) : null}
            {isOwner && order.status === "open" ? (
              <ActionMenuItem
                icon={CheckCircle}
                label="Закрыть заказ"
                onPress={() => {
                  setMenuOpen(false);
                  setCloseSheetOpen(true);
                }}
              />
            ) : null}
            {isOwner && isClosedHistory && canReopen ? (
              <ActionMenuItem
                icon={ArrowCounterClockwise}
                label="Открыть заново"
                onPress={handleReopen}
              />
            ) : null}
            {/* Разделитель перед деструктивным действием (только если оно есть). */}
            {isOwner && isClosedHistory ? (
              <View className="my-1.5 border-t border-hairline" />
            ) : null}
            {isOwner && isClosedHistory ? (
              <ActionMenuItem
                icon={Trash}
                label="Удалить заказ"
                destructive
                onPress={handleDelete}
              />
            ) : null}
            {!isOwner ? (
              <ActionMenuItem
                icon={Flag}
                label="Пожаловаться на заказ"
                destructive
                onPress={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
              />
            ) : null}
          </View>
        </BottomSheet>
      ) : null}

      {/* Шит выбора причины закрытия — две крупные кнопки «Нашёл мастера» /
          «Больше не нужно». Обе ведут в cancelled, но пишут разный
          cancel_reason (план §4). */}
      {order && id && userId ? (
        <CloseReasonSheet
          open={closeSheetOpen}
          pending={cancelOrder.isPending}
          onClose={() => setCloseSheetOpen(false)}
          onPick={handleCloseWithReason}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

interface ActionMenuItemProps {
  icon: typeof Pencil;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

function ActionMenuItem({ icon: Icon, label, destructive, onPress }: ActionMenuItemProps) {
  // BottomSheet рендерится в react-native-web Modal portal, CSS-vars
  // `rgb(var(--X))` там не резолвятся. Получаем hex напрямую из палитры.
  // ВАЖНО: на web используем DOM-тему (читает <html class>), а не системную
  // через useColorScheme() — иначе при системной dark + ручной light в DOM
  // (через ThemeSwitcher) цвета инвертируются и получается белый текст
  // на белом canvas (баг-кейс «Редактировать заказ невидимо», 2026-05-19).
  const isWeb = Platform.OS === "web";
  const domScheme = useDomColorScheme();
  const { colorScheme } = useColorScheme();
  const palette =
    (isWeb ? domScheme : colorScheme) === "dark" ? darkColors : lightColors;
  const tc = useThemeColors(["ink", "error"]);
  const inkColor = isWeb ? palette.ink : tc.ink;
  const errorColor = isWeb ? palette.error : tc.error;
  const iconColor = destructive ? errorColor : inkColor;
  const textColor = destructive ? errorColor : inkColor;
  // Soft-bg для icon-square slot. Для destructive — error-soft (мягкий
  // красный), для обычных — canvas-soft (нейтральный фон).
  const slotBg = destructive
    ? isWeb
      ? palette["error-soft"]
      : palette["error-soft"]
    : isWeb
      ? palette["canvas-soft"]
      : palette["canvas-soft"];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
      })}
    >
      <View
        style={{
          height: 38,
          width: 38,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 10,
          backgroundColor: slotBg,
        }}
      >
        <Icon size={20} weight="bold" color={iconColor} />
      </View>
      <AppText
        weight="medium"
        style={{ color: textColor, fontSize: 16, lineHeight: 22 }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

// ============================================================================
// MyResponseBadgeCTA — карточка-статус для dual-role юзера, который СМОТРИТ
// чужой заказ в client-режиме, но КАК МАСТЕР уже откликался на этот заказ.
// Вместо приглашения «Откликнуться» показываем «Вы откликнулись» + кнопку
// перейти к существующему отклику (one-tap переключение в master-режим →
// MasterResponseSection автоматически появится с уже отправленным откликом).
// Фидбэк владельца 2026-05-27: «как мастер я уже откликнулся, не надо звать
// откликаться снова».
// ============================================================================

function MyResponseBadgeCTA({ userId }: { userId: string }) {
  const setActiveRole = useSetActiveRole();

  const handlePress = () => {
    if (setActiveRole.isPending) return;
    setActiveRole.mutate(
      { userId, role: "master" },
      {
        onError: (e) => {
          Alert.alert(
            "Не удалось переключить роль",
            e instanceof Error ? e.message : "Попробуйте позже.",
          );
        },
      },
    );
  };

  return (
    <View className="mt-8 mx-5 rounded-xl border border-hairline bg-canvas-soft p-5">
      <View className="self-start rounded-pill bg-accent-soft px-3 py-1.5">
        <AppText weight="semibold" className="text-caption text-accent">
          Вы откликнулись
        </AppText>
      </View>
      <AppText weight="semibold" className="mt-3 text-title-md text-ink">
        Отклик уже отправлен
      </AppText>
      <AppText className="mt-2 text-body-sm text-mute">
        Откройте свой отклик, чтобы посмотреть статус и продолжить общение с
        клиентом.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Перейти к моему отклику (переключиться в режим мастера)"
        onPress={handlePress}
        disabled={setActiveRole.isPending}
        className="mt-4 h-12 flex-row items-center justify-center rounded-md border border-hairline bg-canvas active:opacity-70"
      >
        <AppText weight="semibold" className="text-button text-ink">
          {setActiveRole.isPending ? "Переключаем…" : "Перейти к отклику"}
        </AppText>
      </Pressable>
    </View>
  );
}

// ============================================================================
// SwitchToMasterCTA — карточка для DUAL-ROLE юзера (is_master=true), который
// сейчас в клиент-режиме (active_role='client') смотрит чужой заказ.
//
// Принципиально отличается от BecomeMasterCTA: онбординг проходить не нужно,
// мастер-профиль уже есть. One-tap switch → активируется master-режим →
// useUserRecord инвалидируется → MasterResponseSection появится автоматически
// в том же рендере (страница останется на месте).
//
// Sprint 2026-05-20: «если он уже мастер, его переключают на мастер, ну и
// откликаться может» — фидбэк юзера.
// ============================================================================

function SwitchToMasterCTA({ userId }: { userId: string }) {
  const setActiveRole = useSetActiveRole();

  const handlePress = () => {
    if (setActiveRole.isPending) return;
    setActiveRole.mutate(
      { userId, role: "master" },
      {
        onError: (e) => {
          Alert.alert(
            "Не удалось переключить роль",
            e instanceof Error ? e.message : "Попробуйте позже.",
          );
        },
      },
    );
  };

  return (
    <View className="mt-8 mx-5 rounded-xl border border-hairline bg-canvas-soft p-5">
      <AppText weight="semibold" className="text-title-md text-ink">
        Откликнуться на заказ
      </AppText>
      <AppText className="mt-2 text-body-sm text-mute">
        Переключим вас в режим мастера — после этого появится форма отклика.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Откликнуться (переключиться в режим мастера)"
        onPress={handlePress}
        disabled={setActiveRole.isPending}
        className={`mt-4 h-12 flex-row items-center justify-center rounded-md px-5 ${
          setActiveRole.isPending ? "bg-surface-3" : "bg-primary active:opacity-80"
        }`}
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          {setActiveRole.isPending ? "Переключаем…" : "Откликнуться"}
        </AppText>
      </Pressable>
    </View>
  );
}

// ============================================================================
// BecomeMasterCTA — карточка для клиента на чужом заказе
// «Стать мастером и откликнуться». Запоминает return-URL и ведёт на onboarding.
// ============================================================================

function BecomeMasterCTA({ orderId }: { orderId: string }) {
  const router = useRouter();
  const tc = useThemeColors(["accent"]);
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const handlePress = () => {
    // Запоминаем куда вернуться после онбординга (consume в master-photo.tsx).
    useAuthReturnUrlStore.getState().setReturnUrl(`/(tabs)/orders/${orderId}`);
    if (!userId) {
      // Гость — сначала регистрация по телефону. После signup AuthGate
      // (onboarding_completed_at IS NULL) сам отправит на /(onboarding)/role,
      // где гость выберет «мастер» → master-onboarding → возврат на заказ.
      router.push("/(auth)/phone" as never);
    } else {
      // Залогинен как клиент → СРАЗУ на первый шаг мастер-онбординга, минуя
      // экран выбора роли. Why: role.tsx редиректит на /(tabs) любого, у кого
      // onboarding_completed_at уже заполнен (а у действующего клиента он
      // заполнен) — поэтому через role путь «стать мастером» обрывался у
      // существующих клиентов (баг 2026-05-21). master-profile/categories/photo
      // guard'ов на onboarding_completed_at не имеют; финальный шаг
      // finalize_master_onboarding ставит is_master+active_role=master и
      // возвращает на заказ через returnUrl.
      router.push("/(onboarding)/master-profile" as never);
    }
  };

  return (
    <View className="mt-8 mx-5 rounded-xl border border-hairline bg-canvas-soft p-5">
      <AppText weight="semibold" className="text-title-md text-ink">
        Хотите взять этот заказ?
      </AppText>
      <AppText className="mt-2 text-body-sm text-mute">
        Зарегистрируйтесь как мастер — мы вернём вас сюда сразу после регистрации.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Стать мастером и откликнуться"
        onPress={handlePress}
        className="mt-4 h-12 flex-row items-center justify-center rounded-md bg-primary active:opacity-80 px-5"
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          Стать мастером и откликнуться
        </AppText>
      </Pressable>
    </View>
  );
}

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
          Уже нашли мастера?
        </AppText>
        <AppText className="mt-1 text-body-sm text-body">
          Закройте заказ — мастера перестанут писать отклики.
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть заказ"
          onPress={onCloseRequested}
          className="mt-3 h-10 self-start flex-row items-center justify-center px-4 rounded-full bg-primary active:opacity-80"
        >
          <AppText weight="semibold" className="text-button text-on-primary">
            Закрыть заказ
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// ============================================================================
// CloseReasonSheet — bottom-sheet выбора причины закрытия заказа.
//
// Две крупные кнопки (план §4):
//   - «Я нашёл мастера»   → cancel_reason = 'found_master'   (успех)
//   - «Больше не нужно»   → cancel_reason = 'no_longer_needed' (передумал)
//
// Обе ведут заказ в статус cancelled — разница только в сохранённой причине.
// Это замена прежней путаницы «Закрыть» vs «Завершить»: один экран, понятный
// выбор. Отзыв при «нашёл мастера» — отдельная задача (отложена владельцем).
//
// Заголовок-вопрос без подзаголовка (правило §G design-quality.md).
// ============================================================================

interface CloseReasonSheetProps {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onPick: (reason: CancelReason) => void;
}

function CloseReasonSheet({ open, pending, onClose, onPick }: CloseReasonSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Почему закрываете заказ?">
      {/* Два крупных варианта-карточки (Lazyweb: DoorDash refund-sheet, Linear
          status-picker). Каждый — иконка в круге + заголовок + описание справа.
          «Нашёл мастера» — позитивный исход (success-tint), «Больше не нужно» —
          нейтральный. Оба → cancelled, разница в cancel_reason. */}
      <View className="gap-2 px-5 pb-2">
        <CloseReasonOption
          icon={CheckCircle}
          title="Я нашёл мастера"
          description="Договорился с подрядчиком — задача закрыта успешно."
          tone="success"
          disabled={pending}
          onPress={() => onPick("found_master")}
        />
        <CloseReasonOption
          icon={X}
          title="Больше не нужно"
          description="Передумал или решил вопрос другим способом."
          tone="neutral"
          disabled={pending}
          onPress={() => onPick("no_longer_needed")}
        />

        {/* Честное предупреждение о последствиях (паттерн Avito при снятии).
            Это не subtitle под H1, а сноска внизу списка вариантов. */}
        <AppText className="mt-2 text-caption text-mute" style={{ lineHeight: 18 }}>
          Мастера перестанут видеть заказ и не смогут откликнуться. Контакты
          мастеров, которые уже откликнулись, останутся у вас.
        </AppText>
      </View>
    </BottomSheet>
  );
}

// CloseReasonOption — карточка-вариант причины закрытия. Рендерится в
// BottomSheet (Modal-портал), где CSS-vars не резолвятся, поэтому цвета берём
// hex'ом из палитры по DOM-теме (как ActionMenuItem).
interface CloseReasonOptionProps {
  icon: typeof CheckCircle;
  title: string;
  description: string;
  tone: "success" | "neutral";
  disabled: boolean;
  onPress: () => void;
}

function CloseReasonOption({
  icon: Icon,
  title,
  description,
  tone,
  disabled,
  onPress,
}: CloseReasonOptionProps) {
  const isWeb = Platform.OS === "web";
  const domScheme = useDomColorScheme();
  const { colorScheme } = useColorScheme();
  const palette = (isWeb ? domScheme : colorScheme) === "dark" ? darkColors : lightColors;
  const iconColor = tone === "success" ? palette.success : palette.ink;
  const slotBg = tone === "success" ? palette["success-soft"] : palette["canvas-soft"];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed || disabled ? 0.7 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: palette.hairline,
        backgroundColor: palette.canvas,
        paddingVertical: 14,
        paddingHorizontal: 16,
      })}
    >
      <View
        style={{
          height: 44,
          width: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          backgroundColor: slotBg,
        }}
      >
        <Icon size={24} weight={tone === "success" ? "fill" : "bold"} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          weight="semibold"
          style={{ color: palette.ink, fontSize: 16, lineHeight: 22 }}
        >
          {title}
        </AppText>
        <AppText
          style={{ color: palette.mute, fontSize: 13, lineHeight: 18, marginTop: 2 }}
        >
          {description}
        </AppText>
      </View>
    </Pressable>
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
      {/* Status + Category — статус слева (главный сигнал состояния заказа),
          категория мутным chip рядом. Раньше status сидел в header — там
          он сливался с back-button и иконкой действий. */}
      <View className="flex-row items-center gap-2">
        <OrderStatusBadge status={order.status} size="md" />
        <AppText className="text-caption text-mute">·</AppText>
        <AppText weight="medium" className="text-caption text-body">
          {order.l2?.name_ru ?? order.l2_id}
        </AppText>
      </View>

      {/* Display-заголовок — теперь живёт в body (а не в ScreenHeader),
          выбор user 2026-05-15. Hero-стиль entity-page. */}
      <AppText
        weight="display"
        className="mt-3 text-display-md tracking-tight text-ink"
      >
        {order.title}
      </AppText>

      {/* Meta row — срочность + локация. Срочный заказ выделен красным. */}
      <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} weight="bold" color={isUrgent ? tc.error : tc.mute} />
          <AppText
            weight={isUrgent ? "semibold" : "regular"}
            className={`text-body-sm ${isUrgent ? "text-error-deep" : "text-mute"}`}
          >
            {urgencyLabel(order.urgency)}
          </AppText>
        </View>
        <AppText className="text-caption text-muted-soft">·</AppText>
        <View className="flex-row items-center gap-1.5">
          <MapPin size={13} weight="bold" color={tc.mute} />
          <AppText className="text-body-sm text-mute">
            {order.city?.name ?? order.city_id}
            {order.district ? ` · ${order.district}` : ""}
          </AppText>
        </View>
      </View>

      {/* Бюджет — крупный блок с подписью и линией сверху (Linear-референс). */}
      {budgetText ? (
        <View className="mt-5 border-t border-hairline pt-4">
          <AppText className="text-caption uppercase tracking-wide text-mute">Бюджет</AppText>
          <AppText
            weight={isNegotiable ? "semibold" : "mono"}
            className="mt-1 text-display-md text-ink tracking-tight"
          >
            {isNegotiable ? "Цена договорная" : budgetText}
          </AppText>
        </View>
      ) : null}

      {/* Description — body-md ink, плотный текст. */}
      {order.description ? (
        <AppText className="mt-5 text-body-md text-body" style={{ lineHeight: 24 }}>
          {order.description}
        </AppText>
      ) : null}

      {/* Фото заказа — карусель 4:3 после описания (дизайн-спека §4).
          Full-bleed: вырываемся из px-5 родителя через -mx-5. Нет фото →
          OrderPhotoCarousel возвращает null, секции не видно. */}
      {order.photo_urls && order.photo_urls.length > 0 ? (
        <View className="mt-6 -mx-5">
          <OrderPhotoCarousel urls={order.photo_urls} />
        </View>
      ) : null}

      {/* Заказчик — ПРОСТО ИМЯ (решение владельца 2026-05-24): не кнопка, без
          перехода в профиль и без рейтинга. Показываем contact_name (имя,
          которое клиент указал в заказе) → иначе регистрационное имя. Аватар —
          инициалы по показываемому имени (фото аккаунта не раскрываем). Видно
          только мастеру: клиент-владелец и так знает, что заказ его. */}
      {!isOwner ? (
        <View className="mt-6 flex-row items-center gap-3 rounded-xl border border-hairline bg-canvas-soft p-3">
          <Avatar url={null} name={contactDisplay} seed={contactDisplay} size="md" />
          <View className="flex-1 min-w-0">
            <AppText
              weight="medium"
              className="text-caption text-mute uppercase tracking-wider"
              style={{ letterSpacing: 0.5 }}
            >
              Заказчик
            </AppText>
            <AppText
              weight="semibold"
              className="mt-0.5 text-body-md text-ink"
              numberOfLines={1}
            >
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
  const { data: responses, isLoading, error } = useOrderResponses(orderId);
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

  return (
    <View className="mt-8 px-5">
      {/* Heading: «Отклики · N» */}
      <View className="flex-row items-baseline justify-between gap-2">
        <AppText
          weight="semibold"
          className="text-title-md text-ink tracking-tight"
        >
          Отклики
        </AppText>
        {hasResponses ? (
          <AppText weight="mono" className="text-mono-caption text-mute">
            {activeResponses.length}
          </AppText>
        ) : null}
      </View>

      {isLoading && (
        <View className="mt-4 items-start">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <AppText weight="medium" className="mt-3 text-caption text-error">
          {error.message}
        </AppText>
      )}

      {/* Empty state. */}
      {!isLoading && !error && !hasResponses && (
        <View className="mt-3 rounded-xl border border-hairline bg-canvas-soft p-4">
          <AppText weight="medium" className="text-body-sm text-ink">
            Откликов пока нет
          </AppText>
          <AppText className="mt-1 text-body-sm text-mute">
            Обычно первые приходят в течение часа. Уведомим, как только мастер
            отзовётся.
          </AppText>
        </View>
      )}

      {/* Активные отклики. */}
      {activeResponses.length > 0 ? (
        <View className="mt-3 gap-2">
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
                        "мастера";
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
              <AppText
                weight="medium"
                className="text-body-sm text-mute"
              >
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
            <View className="mt-2 gap-2">
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
// Если phone ещё не загружен — кнопка «Позвонить» неактивна (loader).
// Если у мастера нет WhatsApp — кнопка не отображается.
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
  const tc = useThemeColors(["ink", "mute"]);

  // Phone (auth.users) — через RPC get_master_phone. Возвращает null если
  // мастер не активен или у него нет auth.phone.
  const masterPhone = useMasterPhone(response.master_id);
  // WhatsApp (master_profiles) — публично читаемо по RLS.
  const masterPublic = useMasterPublicProfile(response.master_id);

  const phoneRaw = masterPhone.data ?? null;
  const phoneTel = phoneRaw?.replace(/[^\d+]/g, "") ?? null;
  const phoneWa = resolveWhatsappDigits({
    whatsappPhone: masterPublic.data?.master?.whatsapp_phone,
    whatsappSameAsPhone: masterPublic.data?.master?.whatsapp_same_as_phone,
    masterPhone: phoneRaw,
  });

  const masterName =
    [response.master?.first_name, response.master?.last_name].filter(Boolean).join(" ") || "Мастер";
  const priceText = formatResponsePrice(response);
  const isNegotiable = response.price_kind === "negotiable";

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
      className="rounded-xl border border-hairline bg-canvas p-4"
      style={rejected ? { opacity: 0.6 } : undefined}
    >
      {/* Header: avatar + name + price (mono справа). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Профиль ${masterName}`}
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
          <AppText
            weight="semibold"
            className="text-body-md text-ink"
            numberOfLines={1}
          >
            {masterName}
          </AppText>
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
        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Позвонить мастеру"
            disabled={!phoneTel}
            onPress={onCall}
            className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-pill ${
              phoneTel ? "bg-ink active:opacity-85" : "bg-canvas-soft-2"
            }`}
          >
            {phoneTel ? (
              <>
                <Phone size={16} weight="bold" color="rgb(var(--on-primary))" />
                <AppText weight="semibold" className="text-button-sm text-on-primary">
                  Позвонить
                </AppText>
              </>
            ) : masterPhone.isLoading ? (
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
              className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
            >
              <WhatsappLogo size={16} weight="bold" color={tc.ink} />
              <AppText weight="semibold" className="text-button-sm text-ink">
                WhatsApp
              </AppText>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Открыть профиль ${masterName}`}
            onPress={onProfile}
            className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
          >
            <CaretRight size={16} weight="bold" color={tc.ink} />
            <AppText weight="semibold" className="text-button-sm text-ink">
              Профиль
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {/* «Не подходит» — text-link под кнопками. */}
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
              Не подходит
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
  const tc = useThemeColors(["muted-soft", "mute", "ink", "error", "on-primary"]);

  const isPickedMaster = pickedMasterId === masterId;
  const orderClosed = orderStatus !== "open";

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<ResponseFormValues>({
    resolver: zodResolver(responseSchema),
    defaultValues: {
      message: "",
      priceKind: "negotiable",
      priceValue: null,
      leadTime: "",
    },
    mode: "onChange",
  });

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
      });
    } catch (_e) {
      // показывается через submitError
    }
  });

  if (isLoading) {
    return (
      <View className="mt-10 items-center px-6">
        <ActivityIndicator />
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
      orderStatus === "open" &&
      (myResponse.status === "sent" || myResponse.status === "viewed");
    const isBusyWithdraw = withdrawResponse.isPending;

    const onWithdrawPress = async () => {
      if (isBusyWithdraw) return;
      const confirmed = await confirmAsync({
        title: "Отозвать отклик?",
        message:
          "Клиент получит уведомление. Восстановить отклик нельзя — можно создать новый.",
        confirmText: "Отозвать",
        cancelText: "Отмена",
      });
      if (!confirmed) return;
      withdrawResponse.mutate({ responseId: myResponse.id, orderId, masterId });
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
            className="mt-3 h-12 flex-row items-center justify-center gap-2 rounded-xl border border-hairline bg-canvas active:bg-canvas-soft"
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
            Заказ закрыт — отклики больше не принимаются.
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
                <View
                  className={`mt-3 flex-row items-baseline gap-2 border-b pb-2 ${
                    !negotiable && value != null ? "border-hairline-strong" : "border-hairline"
                  }`}
                >
                  <TextInput
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
                    maxFontSizeMultiplier={1.3}
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
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      disabled={isBusy}
                      onPress={() => onChange(k)}
                      className={`h-9 items-center justify-center rounded-md border px-3 ${
                        selected
                          ? "border-ink bg-ink"
                          : "border-hairline bg-canvas active:opacity-70"
                      }`}
                    >
                      <AppText
                        weight="medium"
                        className={`text-caption ${selected ? "text-on-primary" : "text-body"}`}
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

        {/* Срок (опц.) */}
        <View className="p-5">
          <Controller
            control={control}
            name="leadTime"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="medium" className="text-body-sm text-ink">
                  Срок <AppText className="text-caption text-muted-soft">(опционально)</AppText>
                </AppText>
                <TextInput
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Завтра / 2–3 дня / на следующей неделе"
                  placeholderTextColor={tc["muted-soft"]}
                  maxLength={100}
                  maxFontSizeMultiplier={1.3}
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

        {/* Сообщение клиенту */}
        <View className="p-5">
          <Controller
            control={control}
            name="message"
            render={({ field: { value, onChange, onBlur } }) => (
              <View>
                <AppText weight="medium" className="text-body-sm text-ink">
                  Сообщение клиенту
                </AppText>
                <TextInput
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="Здравствуйте, готов взять. Опыт в этой задаче…"
                  placeholderTextColor={tc["muted-soft"]}
                  multiline
                  numberOfLines={4}
                  maxLength={1000}
                  textAlignVertical="top"
                  maxFontSizeMultiplier={1.3}
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
                  <AppText weight="medium" className="mt-2 text-caption text-error">
                    {errors.message.message}
                  </AppText>
                )}
              </View>
            )}
          />
        </View>
      </View>

      {limitReached && (
        <View className="mt-4 rounded-xl border border-hairline bg-canvas-soft p-3">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Лимит откликов на сегодня исчерпан
          </AppText>
          <AppText className="mt-1 text-caption text-muted">
            Вы отправили {responseLimit?.used ?? 5} из {responseLimit?.max ?? 5} откликов. Завтра
            в 00:00 (МСК) появятся новые.
          </AppText>
        </View>
      )}
      {submitError && !limitReached && (
        <AppText weight="medium" className="mt-3 text-caption text-error">
          {limitError
            ? "Лимит откликов на сегодня исчерпан — попробуйте завтра."
            : `Не удалось отправить отклик. ${submitError}`}
        </AppText>
      )}

      {/* Кнопка отклика — full-width чёрная с галочкой (Linear). */}
      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={onSubmit}
        className={`mt-4 h-12 flex-row items-center justify-center gap-2 rounded-xl ${
          canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
        }`}
      >
        {canSubmit ? <Check size={18} weight="bold" color={tc["on-primary"]} /> : null}
        <AppText
          weight="semibold"
          className={`text-button ${canSubmit ? "text-on-primary" : "text-muted-soft"}`}
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
