import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, CheckCircle, CaretRight, Clock, Flag, MapPin, ChatCenteredText, DotsThree, Pencil, Star, Wallet, X } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { BottomSheet, ScreenHeader } from "@/components/ui";
import { useMyChats } from "@/features/chat/use-my-chats";
import { useStartChatWithMaster } from "@/features/chat/use-start-chat";
import { useRejectResponse } from "@/features/orders/use-reject-response";
import {
  OutcomeTrackingModal,
  SNOOZE_MS,
  shouldShowOutcomePrompt,
  useOutcomeStore,
} from "@/features/orders/OutcomeTrackingModal";
import {
  formatPrice,
  orderPriceKindOptions,
  priceKindLabel,
  urgencyLabel,
} from "@/features/orders/order-schema";
import { useAcceptResponse } from "@/features/orders/use-accept-response";
import { useCancelOrder } from "@/features/orders/use-cancel-order";
import { useCompleteOrder } from "@/features/orders/use-complete-order";
import { useConfirmCompletion } from "@/features/orders/use-confirm-completion";
import { useMarkOrderDone } from "@/features/orders/use-mark-order-done";
import { canReopenOrder, useReopenOrder } from "@/features/orders/use-reopen-order";
import { useTerminateCooperation } from "@/features/orders/use-terminate-cooperation";
import { useWithdrawResponse } from "@/features/orders/use-withdraw-response";
import { type OrderDetail, useOrderDetail } from "@/features/orders/use-order-detail";
import {
  type OrderResponseWithMaster,
  useMyResponseForOrder,
  useOrderResponses,
  useSubmitResponse,
} from "@/features/orders/use-order-responses";
import {
  isDailyLimitError,
  useResponseLimit,
} from "@/features/orders/use-response-limit";
import { useMarkResponsesViewed } from "@/features/orders/use-unread-responses";
import { ReportModal } from "@/features/reports/ReportModal";
import { useMyReviewForOrder, useSubmitReview } from "@/features/reviews/use-reviews";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { darkColors, lightColors } from "@/lib/colors";
import { confirmAsync } from "@/lib/confirm";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
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
  const tc = useThemeColors(["ink", "muted-soft", "body", "mute"]);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // safeBack: на вебе orders/[id] и master/[id] живут в разных tab-стеках, поэтому
  // router.back() при cross-stack переходе срабатывает не туда. На web падаем
  // на window.history.back(), на native — обычный back с fallback'ом на список заказов.
  const goBack = useSafeBack("/(tabs)/orders" as const);

  // Резолвим chat по order_id из my-chats (без отдельного запроса).
  const { data: myChats } = useMyChats(userId);
  const orderChat = myChats?.find((c) => c.order_id === id) ?? null;

  // Sprint 12.3 — при open order detail (если owner) помечаем отклики просмотренными.
  const markResponsesViewed = useMarkResponsesViewed(userId);
  const markResponsesMutate = markResponsesViewed.mutate;
  useEffect(() => {
    if (isOwner && id) markResponsesMutate(id);
  }, [isOwner, id, markResponsesMutate]);

  // Outcome tracking modal — Sprint 9.3.
  const cancelOrder = useCancelOrder();
  const completeOrder = useCompleteOrder();
  const dismissFor = useOutcomeStore((s) => s.dismissFor);
  const showOutcomePrompt =
    !!order &&
    !!id &&
    shouldShowOutcomePrompt({
      isOwner,
      orderStatus: order.status,
      pickedMasterId: order.picked_master_id,
      updatedAt: order.updated_at,
      orderId: id,
    });

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

          {userId && id && <CompletionSection orderId={id} order={order} userId={userId} />}
          {userId && id && <ReopenSection orderId={id} order={order} userId={userId} />}

          {isOwner && id && order && (
            <ClientResponsesSection
              orderId={id}
              order={order}
              chatId={orderChat?.id ?? null}
            />
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

          {isOwner && id && order.status === "completed" && userId && order.picked_master_id && (
            <ClientReviewSection
              orderId={id}
              clientId={userId}
              masterId={order.picked_master_id}
              l2Id={order.l2_id}
            />
          )}

          {!isOwner &&
            isMasterRole &&
            id &&
            order.status === "completed" &&
            userId &&
            order.picked_master_id === userId && (
              <MasterReviewSection
                orderId={id}
                masterId={userId}
                clientId={order.client_id}
                l2Id={order.l2_id}
              />
            )}
        </ScrollView>
      )}

      {id && order && userId && (
        <OutcomeTrackingModal
          visible={showOutcomePrompt}
          isBusy={cancelOrder.isPending || completeOrder.isPending}
          onCompletedOffline={() => {
            completeOrder.mutate(
              { orderId: id, userId },
              { onSuccess: () => dismissFor(id, SNOOZE_MS) },
            );
          }}
          onNoDeal={() => {
            cancelOrder.mutate(
              { orderId: id, clientId: order.client_id },
              { onSuccess: () => dismissFor(id, SNOOZE_MS) },
            );
          }}
          onSnooze={() => dismissFor(id, SNOOZE_MS)}
        />
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
          круглых icon-buttons в шапке, чтобы не путать с status-pill. */}
      {order && id && userId ? (
        <BottomSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title="Действия с заказом"
        >
          <View className="gap-1 pb-2">
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
            {isOwner && (order.status === "open" || order.status === "in_progress") ? (
              <ActionMenuItem
                icon={Flag}
                label="Отменить заказ"
                destructive
                onPress={() => {
                  setMenuOpen(false);
                  Alert.alert(
                    "Отменить заказ?",
                    "Отменённый заказ нельзя восстановить. Мастера больше не смогут откликнуться.",
                    [
                      { text: "Назад", style: "cancel" },
                      {
                        text: "Отменить заказ",
                        style: "destructive",
                        onPress: () => {
                          cancelOrder.mutate(
                            { orderId: id, clientId: userId },
                            {
                              onError: (e) =>
                                Alert.alert("Не удалось отменить", e.message),
                            },
                          );
                        },
                      },
                    ],
                  );
                }}
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
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const isWeb = Platform.OS === "web";
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
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
      })}
    >
      <View
        style={{
          height: 32,
          width: 32,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          backgroundColor: slotBg,
        }}
      >
        <Icon size={18} weight="bold" color={iconColor} />
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
// Order info block — общий для всех
// ============================================================================

interface OrderInfoBlockProps {
  order: NonNullable<ReturnType<typeof useOrderDetail>["data"]>;
  /** Клиент сам же видит свой заказ? Тогда «Заказчик»-карточка не показывается
   *  (не показывать себе себя). */
  isOwner: boolean;
}

function OrderInfoBlock({ order, isOwner }: OrderInfoBlockProps) {
  const router = useRouter();
  const clientDisplay =
    [order.client?.first_name, order.client?.last_name].filter(Boolean).join(" ") || "Клиент";
  const clientRating = order.client?.rating_as_client_avg;
  const clientRatingCount = order.client?.rating_as_client_count ?? 0;
  const tc = useThemeColors(["muted-soft", "mute", "ink", "warning"]);

  // Бюджет — отдельный display-режим: разделяем сумму и пометку «договорной».
  const budgetText = formatBudget(order);
  const isNegotiable = order.budget_kind === "negotiable";

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

      {/* Meta row — urgency + location, с иконками */}
      <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} weight="bold" color={tc.mute} />
          <AppText className="text-body-sm text-mute">{urgencyLabel(order.urgency)}</AppText>
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

      {/* Budget hero — крупно, mono. Это первая цифра, на которую смотрит мастер. */}
      {budgetText ? (
        <View className="mt-5 flex-row items-center gap-2">
          <Wallet size={18} weight="bold" color={tc.ink} />
          {isNegotiable ? (
            <AppText weight="semibold" className="text-title-md text-ink">
              Цена договорная
            </AppText>
          ) : (
            <AppText weight="mono" className="text-title-lg text-ink">
              {budgetText}
            </AppText>
          )}
        </View>
      ) : null}

      {/* Description — body-md ink, плотный текст. */}
      {order.description ? (
        <AppText className="mt-5 text-body-md text-body" style={{ lineHeight: 24 }}>
          {order.description}
        </AppText>
      ) : null}

      {/* Author card — рендерится ТОЛЬКО для мастера. Клиент-владелец не должен
          видеть «Заказчик: Алина Тестова» внутри своего же заказа — это
          избыточная информация (он и так знает, что заказ его). */}
      {!isOwner ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Профиль клиента ${clientDisplay}`}
          onPress={() => router.push(`/client/${order.client_id}` as never)}
          className="mt-6 flex-row items-center gap-3 rounded-xl border border-hairline bg-canvas-soft p-3 active:bg-canvas hover:bg-canvas"
        >
          <Avatar
            url={order.client?.avatar_url ?? null}
            name={clientDisplay}
            seed={order.client?.id ?? order.client_id}
            size="md"
          />
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
              {clientDisplay}
            </AppText>
          </View>
          {clientRating != null && clientRatingCount > 0 ? (
            <View className="flex-row items-center gap-1">
              <Star size={13} weight="fill" color={tc.warning} />
              <AppText weight="mono" className="text-mono-caption text-ink">
                {clientRating.toFixed(1)}
              </AppText>
              <AppText weight="mono" className="text-mono-caption text-mute">
                ({clientRatingCount})
              </AppText>
            </View>
          ) : null}
          <CaretRight size={16} weight="bold" color={tc["muted-soft"]} />
        </Pressable>
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
// ============================================================================

interface ClientResponsesSectionProps {
  orderId: string;
  order: OrderDetail;
  /** chat-id если он уже существует (после accept) — для кнопки «Открыть чат». */
  chatId?: string | null;
}

function ClientResponsesSection({ orderId, order, chatId }: ClientResponsesSectionProps) {
  const router = useRouter();
  const tc = useThemeColors(["muted-soft"]);
  const { data: responses, isLoading, error } = useOrderResponses(orderId);
  const acceptResponse = useAcceptResponse();
  const startChat = useStartChatWithMaster();
  const rejectResponse = useRejectResponse();

  // Точечный pending-state: какой именно мастер сейчас в процессе действия.
  // Без этого `mutation.isPending` triggers loading-state у ВСЕХ карточек,
  // потому что один TanStack mutation общий для всех откликов.
  const [pendingWriteMasterId, setPendingWriteMasterId] = useState<string | null>(null);
  const [pendingAcceptResponseId, setPendingAcceptResponseId] = useState<string | null>(null);
  const [pendingRejectResponseId, setPendingRejectResponseId] = useState<string | null>(null);
  // Раскрыт ли блок «Скрытые отклики» (по умолчанию свёрнут).
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  // Кнопка «Написать» на карточке мастера — создаёт chat (или открывает
  // существующий) и уводит в /chats/[id]. До accept_response.
  const onWriteToMaster = (masterId: string) => {
    if (pendingWriteMasterId) return;
    setPendingWriteMasterId(masterId);
    startChat.mutate(
      { orderId, masterId, clientUserId: order.client_id },
      {
        onSuccess: (newChatId) => {
          setPendingWriteMasterId(null);
          router.push(`/chats/${newChatId}` as never);
        },
        onError: (e) => {
          setPendingWriteMasterId(null);
          Alert.alert("Не удалось открыть чат", e.message);
        },
      },
    );
  };

  const onAcceptResponseClick = (responseId: string) => {
    if (pendingAcceptResponseId) return;
    setPendingAcceptResponseId(responseId);
    acceptResponse.mutate(
      { responseId, orderId, clientId: order.client_id },
      {
        onSettled: () => setPendingAcceptResponseId(null),
      },
    );
  };

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
  const pickedResponse = responses?.find((r) => r.master_id === order.picked_master_id);
  // Активные = не picked + не rejected. Rejected — в отдельную секцию.
  const allOthers = responses?.filter((r) => r.master_id !== order.picked_master_id) ?? [];
  const activeOthers = allOthers.filter((r) => r.status !== "rejected");
  const rejectedOthers = allOthers.filter((r) => r.status === "rejected");
  const activeCount = activeOthers.length + (pickedResponse ? 1 : 0);

  return (
    <View className="mt-8 px-5">
      {/* Heading: «Отклики · N» или «Ваш мастер» */}
      <View className="flex-row items-baseline justify-between gap-2">
        <AppText
          weight="semibold"
          className="text-title-md text-ink tracking-tight"
        >
          {pickedResponse ? "Ваш мастер" : "Отклики"}
        </AppText>
        {hasResponses ? (
          <AppText weight="mono" className="text-mono-caption text-mute">
            {pickedResponse ? "1 выбран" : `${activeCount}`}
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

      {/* Empty state — обещаем «обычно за час». Vercel-style тонкая карточка. */}
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

      {/* Picked master — hero-card зелёный success. Воздух mt-5 между
          заголовком «Ваш мастер» и карточкой — раньше шла впритык, выглядело
          сплющенно (фидбэк user 2026-05-15). */}
      {pickedResponse ? (
        <View className="mt-5">
          <ClientMasterResponseCard
            key={pickedResponse.id}
            response={pickedResponse}
            variant="picked"
            chatId={chatId ?? null}
            isBusy={pendingAcceptResponseId === pickedResponse.id}
            isWriting={pendingWriteMasterId === pickedResponse.master_id}
            isRejecting={false}
            onAccept={() => onAcceptResponseClick(pickedResponse.id)}
            onOpenMaster={() => router.push(`/master/${pickedResponse.master_id}` as never)}
            onOpenChat={() => {
              if (chatId) router.push(`/chats/${chatId}` as never);
            }}
            onWrite={() => onWriteToMaster(pickedResponse.master_id)}
            onReject={undefined}
          />
        </View>
      ) : null}

      {/* Active others */}
      {activeOthers.length > 0 ? (
        <View className="mt-3 gap-2">
          {activeOthers.map((r) => (
            <ClientMasterResponseCard
              key={r.id}
              response={r}
              variant={
                isOpen && (r.status === "sent" || r.status === "viewed")
                  ? "actionable"
                  : "passive"
              }
              chatId={null}
              isBusy={pendingAcceptResponseId === r.id}
              isWriting={pendingWriteMasterId === r.master_id}
              isRejecting={pendingRejectResponseId === r.id}
              onAccept={() => onAcceptResponseClick(r.id)}
              onOpenMaster={() => router.push(`/master/${r.master_id}` as never)}
              onWrite={() => onWriteToMaster(r.master_id)}
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

      {/* Скрытые отклики — collapsible. Не маячат в общем списке, но
          доступны при необходимости (вернуть/просмотреть). */}
      {rejectedOthers.length > 0 ? (
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
                  {rejectedOthers.length}
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
              {rejectedOthers.map((r) => (
                <ClientMasterResponseCard
                  key={r.id}
                  response={r}
                  variant="rejected"
                  chatId={null}
                  isBusy={false}
                  isWriting={false}
                  isRejecting={false}
                  onAccept={() => {}}
                  onOpenMaster={() => router.push(`/master/${r.master_id}` as never)}
                  onWrite={() => onWriteToMaster(r.master_id)}
                  onReject={undefined}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {acceptResponse.error && (
        <AppText weight="medium" className="mt-3 text-caption text-error">
          Не удалось принять отклик. {acceptResponse.error.message}
        </AppText>
      )}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Master response card (TaskRabbit + Vercel-tier)
//
// Layout:
//   ┌─ Avatar(md) ─ Name + ★rating ─────────── Price-pill ─┐
//   │              message body (2-3 lines)                │
//   │              ⏱ срок (если указан)                    │
//   │              ─── divider ───                         │
//   │     [Принять primary]  [Написать ghost-icon] ┃ Профиль│
//   └──────────────────────────────────────────────────────┘
//
// Variants:
//   - picked: бордер success + bg success-soft, primary CTA «Открыть чат»
//   - actionable: open + status=sent, primary CTA «Принять»
//   - passive: всё прочее (other-picked, withdrawn) — без actions
//   - rejected: muted opacity 0.55
// ----------------------------------------------------------------------------
type MasterCardVariant = "picked" | "actionable" | "passive" | "rejected";

interface ClientMasterResponseCardProps {
  response: OrderResponseWithMaster;
  variant: MasterCardVariant;
  chatId: string | null;
  isBusy: boolean;
  isWriting: boolean;
  isRejecting: boolean;
  onAccept: () => void;
  onOpenMaster: () => void;
  onOpenChat?: () => void;
  onWrite: () => void;
  /** Если undefined — кнопка «Скрыть» не показывается (заказ закрыт /
   *  rejected уже / picked-вариант). */
  onReject: (() => void) | undefined;
}

function ClientMasterResponseCard({
  response,
  variant,
  chatId,
  isBusy,
  isWriting,
  isRejecting,
  onAccept,
  onOpenMaster,
  onOpenChat,
  onWrite,
  onReject,
}: ClientMasterResponseCardProps) {
  const tc = useThemeColors(["ink", "mute", "muted-soft", "warning", "success", "on-primary"]);

  const masterName =
    [response.master?.first_name, response.master?.last_name].filter(Boolean).join(" ") || "Мастер";
  const priceText = formatResponsePrice(response);
  const isNegotiable = response.price_kind === "negotiable";

  const isPicked = variant === "picked";
  const isActionable = variant === "actionable";
  const isRejected = variant === "rejected";

  const cardClassName = isPicked
    ? "rounded-xl border-2 border-success bg-success-soft p-4"
    : "rounded-xl border border-hairline bg-canvas p-4 hover:bg-canvas-soft";

  // Picked-вариант рендерится по другой структуре — больше воздуха, цена
  // отдельным блоком, ВЫБРАН выходит из-под имени. Это «свой мастер»,
  // главная карточка экрана — её нельзя сжимать.
  if (isPicked) {
    return (
      <View className={cardClassName}>
        {/* Row 1: avatar + (name + meta) + ВЫБРАН pill */}
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Профиль ${masterName}`}
            onPress={onOpenMaster}
            className="flex-1 flex-row items-center gap-3 active:opacity-70"
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
                  <Clock size={12} weight="bold" color={tc["muted-soft"]} />
                  <AppText className="text-caption text-mute" numberOfLines={1}>
                    {response.lead_time}
                  </AppText>
                </View>
              ) : null}
            </View>
          </Pressable>
          <View className="rounded-full bg-success px-2.5 py-1">
            <AppText
              weight="bold"
              className="text-caption-xs"
              style={{ color: tc["on-primary"], letterSpacing: 0.5 }}
            >
              ВЫБРАН
            </AppText>
          </View>
        </View>

        {/* Price block — отдельная строка с label слева и value mono справа.
            Раньше цена висела в углу под бейджем «ВЫБРАН» — было сжато
            и нечитаемо. */}
        <View className="mt-4 flex-row items-baseline justify-between border-t border-success/30 pt-3">
          <AppText
            weight="medium"
            className="text-caption text-mute uppercase tracking-wider"
            style={{ letterSpacing: 0.5 }}
          >
            Цена
          </AppText>
          <AppText
            weight={isNegotiable ? "semibold" : "mono"}
            className={`${isNegotiable ? "text-body-md" : "text-title-md"} text-ink`}
          >
            {priceText}
          </AppText>
        </View>

        {/* Message body */}
        {response.message ? (
          <AppText
            className="mt-3 text-body-sm text-body"
            style={{ lineHeight: 20 }}
          >
            {response.message}
          </AppText>
        ) : null}

        {/* CTA — «Открыть чат» (full-width primary). */}
        {chatId && onOpenChat ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenChat}
            className="mt-5 h-12 flex-row items-center justify-center gap-2 rounded-pill bg-ink active:opacity-80"
          >
            <ChatCenteredText size={16} weight="bold" color={tc["on-primary"]} />
            <AppText weight="semibold" className="text-button text-on-primary">
              Открыть чат
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View className={cardClassName} style={isRejected ? { opacity: 0.6 } : undefined}>
      {/* Header: Avatar + Name (full-width). Цена вынесена ПОД имя
          самостоятельной строкой — раньше inline с именем и при длинных
          ценах вроде «2 500 – 3 000 ₽» имя обрезалось на «Ислам То…». */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Профиль ${masterName}`}
        onPress={onOpenMaster}
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
          <View className="mt-0.5 flex-row items-baseline gap-2">
            <AppText
              weight={isNegotiable ? "semibold" : "mono"}
              className={`${isNegotiable ? "text-body-sm" : "text-body-md"} text-ink`}
            >
              {priceText}
            </AppText>
            {response.lead_time ? (
              <>
                <AppText className="text-caption text-muted-soft">·</AppText>
                <AppText className="flex-1 text-caption text-mute" numberOfLines={1}>
                  {response.lead_time}
                </AppText>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>

      {/* Message body */}
      {response.message ? (
        <AppText
          className="mt-3 text-body-sm text-body"
          style={{ lineHeight: 20 }}
          numberOfLines={4}
        >
          {response.message}
        </AppText>
      ) : null}

      {/* Status hint для rejected */}
      {isRejected ? (
        <AppText weight="medium" className="mt-2 text-caption text-muted-soft">
          Скрыто
        </AppText>
      ) : null}

      {/* Action row — две кнопки БЕЗ иконок (фидбэк user 2026-05-15):
          - «Написать» (outline pill)
          - «Выбрать» (filled black primary pill — Vercel-style, не неон-success) */}
      {isActionable ? (
        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={isWriting}
            onPress={onWrite}
            className="h-11 flex-1 items-center justify-center rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
          >
            {isWriting ? (
              <ActivityIndicator size="small" color={tc.ink} />
            ) : (
              <AppText weight="semibold" className="text-button text-ink">
                Написать
              </AppText>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onAccept}
            className={`h-11 flex-1 items-center justify-center rounded-pill ${
              isBusy ? "bg-canvas-soft-2" : "bg-ink active:opacity-85"
            }`}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={tc.mute} />
            ) : (
              // text-on-primary через className (CSS-var правильно подхватывается
              // RNW + native NativeWind). Inline style {color: tc["on-primary"]}
              // на web иногда теряется из-за специфичности — текст становился
              // почти чёрным на чёрной кнопке.
              <AppText weight="semibold" className="text-button text-on-primary">
                Выбрать
              </AppText>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* «Не подходит» — text-link под кнопками. Заменяет круглую «×»
          в углу карточки (фидбэк: «иксик непонятный, некрасивый»). */}
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
  const tc = useThemeColors(["muted-soft", "ink", "error"]);

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
    const iconColor = isPickedMaster ? "#10b981" : "#2563eb";
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
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваш отклик
        </AppText>
        <View
          className={`mt-3 rounded-lg border ${
            isPickedMaster ? "border-hairline bg-canvas-soft" : accentClass
          } p-4`}
        >
          {!isPickedMaster && (
            <View className="flex-row items-center gap-2">
              <ChatCenteredText size={16} weight="bold" color={iconColor} />
              <AppText weight="semibold" className={`text-body-md ${textColor}`}>
                {responseStatusLabel(myResponse.status)}
              </AppText>
            </View>
          )}
          <AppText
            weight="medium"
            className={`${isPickedMaster ? "" : "mt-2 "}text-body-md text-ink`}
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
            className="mt-3 h-11 flex-row items-center justify-center gap-2 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
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

  // Заказ закрыт (in_progress/completed/cancelled), мастер не откликался → CTA отключён
  if (orderClosed) {
    return (
      <View className="mt-10 px-6">
        <View className="rounded-lg bg-surface-2 p-4">
          <AppText weight="medium" className="text-body-sm text-muted">
            Клиент уже выбрал мастера. Отклики больше не принимаются.
          </AppText>
        </View>
      </View>
    );
  }

  // Форма отклика
  return (
    <View className="mt-10 gap-4 px-6">
      <AppText weight="semibold" className="text-title-lg text-ink">
        Отправить отклик
      </AppText>

      {/* Price mode */}
      <View>
        <AppText weight="medium" className="text-caption text-muted">
          Цена
        </AppText>
        <Controller
          control={control}
          name="priceKind"
          render={({ field: { value, onChange } }) => (
            <View className="mt-2 flex-row flex-wrap gap-2">
              {orderPriceKindOptions.map((k) => {
                const selected = value === k;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={isBusy}
                    onPress={() => onChange(k)}
                    className={`h-10 items-center justify-center rounded-pill border px-4 ${
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
        {priceKind !== "negotiable" && (
          <View className="mt-3">
            <Controller
              control={control}
              name="priceValue"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  value={value === null ? "" : String(value)}
                  onBlur={onBlur}
                  onChangeText={(raw) => {
                    const cleaned = raw.replace(/\D/g, "");
                    onChange(cleaned === "" ? null : Number.parseInt(cleaned, 10));
                  }}
                  placeholder={
                    priceKind === "fixed" ? "Сумма, ₽" : priceKind === "from" ? "От, ₽" : "До, ₽"
                  }
                  placeholderTextColor={tc["muted-soft"]}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxFontSizeMultiplier={1.3}
                  className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
                  editable={!isBusy}
                />
              )}
            />
          </View>
        )}
      </View>

      {/* Lead time */}
      <View>
        <Controller
          control={control}
          name="leadTime"
          render={({ field: { value, onChange, onBlur } }) => (
            <View>
              <AppText weight="medium" className="text-caption text-muted">
                Срок (опц.)
              </AppText>
              <TextInput
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="Завтра / 2-3 дня / на следующей неделе"
                placeholderTextColor={tc["muted-soft"]}
                maxLength={100}
                maxFontSizeMultiplier={1.3}
                className="mt-2 h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
                editable={!isBusy}
              />
            </View>
          )}
        />
      </View>

      {/* Message */}
      <View>
        <Controller
          control={control}
          name="message"
          render={({ field: { value, onChange, onBlur } }) => (
            <View>
              <AppText weight="medium" className="text-caption text-muted">
                Сообщение клиенту
              </AppText>
              <TextInput
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="Здравствуйте, готов взять. Опыт в этой задаче..."
                placeholderTextColor={tc["muted-soft"]}
                multiline
                numberOfLines={4}
                maxLength={1000}
                textAlignVertical="top"
                maxFontSizeMultiplier={1.3}
                className={`mt-2 min-h-24 rounded-md border bg-canvas px-3 py-3 text-body-md text-ink ${
                  errors.message ? "border-error" : "border-hairline"
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

      {limitReached && (
        <View className="rounded-md border border-hairline bg-canvas-soft p-3">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Лимит откликов на сегодня исчерпан
          </AppText>
          <AppText className="mt-1 text-caption text-muted">
            Вы отправили {responseLimit?.used ?? 5} из {responseLimit?.max ?? 5} откликов.
            Завтра в 00:00 (МСК) появятся новые. В будущем планируется опция
            «больше откликов» — пока всё бесплатно.
          </AppText>
        </View>
      )}
      {submitError && !limitReached && (
        <AppText weight="medium" className="text-caption text-error">
          {limitError
            ? "Лимит откликов на сегодня исчерпан — попробуйте завтра."
            : `Не удалось отправить отклик. ${submitError}`}
        </AppText>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!isValid || isBusy || limitReached}
        onPress={onSubmit}
        className={`h-12 items-center justify-center rounded-md ${
          isValid && !isBusy && !limitReached ? "bg-primary active:opacity-80" : "bg-surface-3"
        }`}
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          {limitReached
            ? "Лимит исчерпан"
            : isBusy
              ? "Отправляем..."
              : "Отправить отклик"}
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
      return "Клиент выбрал вас";
    case "rejected":
      return "Клиент отклонил";
    case "withdrawn":
      return "Отклик отозван";
  }
}

// ============================================================================
// Completion section — кнопка "Работа выполнена" для in_progress (обе стороны)
// ============================================================================

interface CompletionSectionProps {
  orderId: string;
  order: OrderDetail;
  userId: string;
}

/**
 * CompletionSection — кнопки управления статусом заказа в /orders/[id].
 *
 * Источник истины: docs/lifecycle.md §4 (матрица переходов).
 *
 * Что показываем (по role × status):
 *
 *   in_progress:
 *     - client  → «Подтвердить выполнение» (T4) + «Прекратить сотрудничество» (T6t)
 *     - master  → «Работа выполнена»     (T8) + «Прекратить сотрудничество» (T6t)
 *
 *   awaiting_confirmation:
 *     - client  → «Подтвердить выполнение» (T5) + «Прекратить сотрудничество» (T6t)
 *     - master  → «Ждём подтверждения клиента, осталось X» (read-only) + «Прекратить сотрудничество» (T6t)
 *
 *   disputed:
 *     - оба → read-only «Спор открыт N дней назад. Саппорт рассмотрит ~5 рабочих дней.»
 *       (Существующие до 2026-05-16 disputed-заказы; новых UI не создаёт.)
 *
 *   cancelled/expired (для клиента в 7-дневном окне) → отдельная ReopenSection (T9).
 *   completed → review-секция (ниже в этом файле, не здесь).
 *   open → ничего не показываем (форма отклика мастера / список откликов клиента).
 *
 * Изменено 2026-05-16: вместо «Открыть спор» — «Прекратить сотрудничество»
 * (T6t terminate_cooperation). По фидбэку user: спор слишком тяжёлый для
 * нашего рынка, чаще нужен простой выход «работа не дошла до конца».
 */
function CompletionSection({ orderId, order, userId }: CompletionSectionProps) {
  const markDone = useMarkOrderDone();
  const confirmCompletion = useConfirmCompletion();
  const terminateCooperation = useTerminateCooperation();
  const tc = useThemeColors(["mute", "success", "error", "ink"]);

  const isClient = order.client_id === userId;
  const isPickedMaster = order.picked_master_id === userId;
  const status = order.status;

  // disputed — read-only блок для legacy-заказов (новых UI больше не создаёт,
  // RPC open_dispute остался для будущей админки через service_role).
  if (status === "disputed" && (isClient || isPickedMaster)) {
    const daysAgo = order.disputed_at
      ? Math.max(0, Math.floor((Date.now() - new Date(order.disputed_at).getTime()) / (1000 * 60 * 60 * 24)))
      : null;
    return (
      <View className="mt-8 px-5">
        <View className="rounded-lg border border-error bg-error-soft p-4">
          <AppText weight="semibold" className="text-body-md text-error">
            Спор открыт
            {daysAgo !== null ? ` ${daysAgo} ${daysAgo === 1 ? "день" : daysAgo < 5 ? "дня" : "дней"} назад` : ""}
          </AppText>
          <AppText className="mt-2 text-body-sm text-body">
            Саппорт рассмотрит обращение в течение 5 рабочих дней и закроет заказ в пользу одной из сторон.
          </AppText>
          {order.dispute_reason ? (
            <AppText className="mt-2 text-caption text-muted">
              Причина: {order.dispute_reason}
            </AppText>
          ) : null}
        </View>
      </View>
    );
  }

  // Если не active lifecycle status или not a participant — ничего не показываем
  if (status !== "in_progress" && status !== "awaiting_confirmation") return null;
  if (!isClient && !isPickedMaster) return null;

  const isBusy =
    markDone.isPending ||
    confirmCompletion.isPending ||
    terminateCooperation.isPending;

  // ===== Primary button label / handler =====
  let primaryLabel: string;
  let primaryHandler: () => Promise<void>;
  let primaryEnabled = true;
  let primaryError: string | null = null;
  let primaryCaption: string;

  if (isClient) {
    primaryLabel = "Подтвердить выполнение";
    primaryCaption = status === "awaiting_confirmation"
      ? "Мастер сообщил, что работа выполнена. Подтвердите — заказ перейдёт в «Завершён», и вы сможете оставить отзыв."
      : "Заказ перейдёт в «Завершён», и вы сможете оставить отзыв. Действие нельзя отменить.";
    primaryError = confirmCompletion.error?.message ?? null;
    primaryHandler = async () => {
      if (isBusy) return;
      const confirmed = await confirmAsync({
        title: "Подтвердить, что работа выполнена?",
        message: primaryCaption,
        confirmText: "Подтвердить",
        cancelText: "Отмена",
      });
      if (!confirmed) return;
      confirmCompletion.mutate({ orderId, userId });
    };
  } else if (status === "in_progress") {
    primaryLabel = "Работа выполнена";
    primaryCaption = "Клиент получит уведомление и подтвердит за 72 часа — либо заказ закроется автоматически.";
    primaryError = markDone.error?.message ?? null;
    primaryHandler = async () => {
      if (isBusy) return;
      const confirmed = await confirmAsync({
        title: "Пометить заказ выполненным?",
        message: primaryCaption,
        confirmText: "Да, выполнено",
        cancelText: "Отмена",
      });
      if (!confirmed) return;
      markDone.mutate({ orderId, userId });
    };
  } else {
    // master + awaiting_confirmation: read-only countdown
    primaryEnabled = false;
    primaryLabel = "Ждём клиента";
    const hoursLeft = order.awaiting_confirmation_until
      ? Math.max(0, Math.floor((new Date(order.awaiting_confirmation_until).getTime() - Date.now()) / (1000 * 60 * 60)))
      : null;
    primaryCaption = hoursLeft !== null
      ? `Клиент подтвердит выполнение или оспорит. Осталось ${hoursLeft} ч до auto-закрытия.`
      : "Клиент подтвердит выполнение или оспорит в течение 72 часов.";
    primaryHandler = async () => {};
  }

  // Минималистичный layout (2026-05-16):
  //   - Убран eyebrow «ЗАВЕРШЕНИЕ РАБОТЫ» — заголовок не нужен, действие
  //     самоочевидно из контекста заказа со статусом «В работе».
  //   - Primary CTA — solid bg-success + white text (раньше green outline →
  //     не было ясной иерархии с secondary). Это happy-path.
  //   - Secondary «Прекратить сотрудничество» — text-only ghost (без border),
  //     text-mute (не red, чтобы не визуально конкурировать с primary).
  //   - Длинный caption удалён — это инфо есть в confirm-modal.
  return (
    <View className="mt-8 px-5">
      {primaryEnabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          disabled={isBusy}
          onPress={primaryHandler}
          className={`h-12 flex-row items-center justify-center gap-2 rounded-pill ${
            isBusy ? "bg-canvas-soft" : "bg-success active:opacity-80"
          }`}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={tc.mute} />
          ) : (
            <>
              <CheckCircle size={18} weight="fill" color="#ffffff" />
              <AppText weight="semibold" className="text-button text-white">
                {primaryLabel}
              </AppText>
            </>
          )}
        </Pressable>
      ) : (
        // Read-only «Ждём клиента» — серый pill + caption с countdown'ом
        // (количество часов до auto-закрытия — это полезная инфо до клика).
        <>
          <View className="h-12 flex-row items-center justify-center gap-2 rounded-pill bg-canvas-soft">
            <Clock size={18} weight="bold" color={tc.mute} />
            <AppText weight="semibold" className="text-button text-mute">
              {primaryLabel}
            </AppText>
          </View>
          <AppText className="mt-2 text-center text-caption text-mute">
            {primaryCaption}
          </AppText>
        </>
      )}

      {primaryError && (
        <AppText weight="medium" className="mt-2 text-center text-caption text-error">
          {primaryError}
        </AppText>
      )}

      {/* Secondary destructive action — text-only ghost, не должен конкурировать
          по визуальному весу с primary. Confirm-dialog содержит всю инфу о
          последствиях. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Прекратить сотрудничество"
        disabled={isBusy}
        onPress={async () => {
          if (isBusy) return;
          const confirmed = await confirmAsync({
            title: "Прекратить сотрудничество?",
            message:
              "Заказ закроется со статусом «отменён» — работа не была выполнена. Другая сторона получит уведомление.",
            confirmText: "Да, прекратить",
            cancelText: "Отмена",
          });
          if (!confirmed) return;
          terminateCooperation.mutate({ orderId, userId });
        }}
        className="mt-3 h-10 items-center justify-center active:opacity-60"
      >
        <AppText weight="medium" className="text-caption text-mute">
          Прекратить сотрудничество
        </AppText>
      </Pressable>

      {terminateCooperation.error && (
        <AppText weight="medium" className="mt-2 text-center text-caption text-error">
          {terminateCooperation.error.message}
        </AppText>
      )}
    </View>
  );
}

// ============================================================================
// ReopenSection — кнопка «Возобновить» для cancelled/expired в 7-дневном окне.
// Доступна только клиенту-владельцу заказа. RPC reopen_order (T9).
// См. docs/lifecycle.md §4 (T9).
// ============================================================================

interface ReopenSectionProps {
  orderId: string;
  order: OrderDetail;
  userId: string;
}

function ReopenSection({ orderId, order, userId }: ReopenSectionProps) {
  const reopenOrder = useReopenOrder();
  const tc = useThemeColors(["accent"]);

  const isOwner = order.client_id === userId;
  if (!isOwner) return null;
  if (!canReopenOrder(order.status, order.updated_at)) return null;

  const isBusy = reopenOrder.isPending;
  const daysLeft = Math.max(
    0,
    7 - Math.floor((Date.now() - new Date(order.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
  );

  const onPress = async () => {
    if (isBusy) return;
    const confirmed = await confirmAsync({
      title: "Возобновить заказ?",
      message: "Заявка снова станет открытой на 14 дней. Мастера получат уведомление и смогут откликнуться.",
      confirmText: "Возобновить",
      cancelText: "Отмена",
    });
    if (!confirmed) return;
    reopenOrder.mutate({ orderId, userId });
  };

  return (
    <View className="mt-8 px-5">
      <AppText weight="mono" className="text-mono-caption text-mute uppercase tracking-widest">
        Возобновление
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Возобновить заказ"
        disabled={isBusy}
        onPress={onPress}
        className={`mt-3 h-12 flex-row items-center justify-center gap-2 rounded-pill border-2 ${
          isBusy ? "border-hairline bg-canvas-soft" : "border-accent bg-canvas active:bg-accent-soft"
        }`}
      >
        <CaretRight size={18} weight="bold" color={tc.accent} />
        <AppText weight="semibold" className="text-button text-accent">
          {isBusy ? "Возобновляем..." : "Возобновить заказ"}
        </AppText>
      </Pressable>
      <AppText className="mt-3 text-center text-caption text-mute">
        Окно возобновления закроется через {daysLeft} {daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}.
      </AppText>
      {reopenOrder.error && (
        <AppText weight="medium" className="mt-2 text-center text-caption text-error">
          {reopenOrder.error.message}
        </AppText>
      )}
    </View>
  );
}

// ============================================================================
// Client review section — после завершения, форма отзыва
// ============================================================================

interface ClientReviewSectionProps {
  orderId: string;
  clientId: string;
  masterId: string;
  l2Id: string;
}

function ClientReviewSection({ orderId, clientId, masterId, l2Id }: ClientReviewSectionProps) {
  const { data: myReview, isLoading } = useMyReviewForOrder(orderId, clientId);
  const submitReview = useSubmitReview();
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState("");
  const tc = useThemeColors(["muted-soft", "warning"]);

  if (isLoading) return null;

  if (myReview) {
    return (
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваш отзыв
        </AppText>
        <View className="mt-3 rounded-lg border border-hairline bg-surface-2 p-4">
          <View className="flex-row gap-1">
            {[1, 2, 3, 4, 5].map((s) => {
              const filled = s <= myReview.rating;
              return (
                <Star
                  key={s}
                  size={18}
                  weight={filled ? "fill" : "bold"}
                  color={filled ? tc.warning : tc["muted-soft"]}
                />
              );
            })}
          </View>
          {myReview.text && (
            <AppText className="mt-2 text-body-sm text-body">{myReview.text}</AppText>
          )}
        </View>
      </View>
    );
  }

  const isBusy = submitReview.isPending;
  const canSubmit = rating >= 1 && rating <= 5 && !isBusy;

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      await submitReview.mutateAsync({
        orderId,
        authorId: clientId,
        targetId: masterId,
        l2Id,
        rating,
        text,
        direction: "client_to_master",
      });
    } catch (_e) {
      // через submitReview.error
    }
  };

  return (
    <View className="mt-10 px-6">
      <AppText weight="semibold" className="text-title-lg text-ink">
        Оцените мастера
      </AppText>
      <AppText className="mt-1 text-body-sm text-muted">
        Ваш отзыв помогает другим клиентам выбрать.
      </AppText>

      <View className="mt-4 flex-row gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`${s} звёзд`}
            onPress={() => setRating(s)}
            disabled={isBusy}
            hitSlop={4}
            className="active:opacity-70"
          >
            <Star
              size={36}
              weight={s <= rating ? "fill" : "bold"}
              color={s <= rating ? tc.warning : tc["muted-soft"]}
            />
          </Pressable>
        ))}
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Расскажите о работе мастера (опц.)"
        placeholderTextColor={tc["muted-soft"]}
        multiline
        numberOfLines={3}
        maxLength={2000}
        textAlignVertical="top"
        maxFontSizeMultiplier={1.3}
        className="mt-4 min-h-24 rounded-md border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
        editable={!isBusy}
      />

      {submitReview.error && (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          {submitReview.error.message}
        </AppText>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={onSubmit}
        className={`mt-4 h-12 items-center justify-center rounded-md ${
          canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
        }`}
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          {isBusy ? "Сохраняем..." : "Оставить отзыв"}
        </AppText>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Master review section — мастер оценивает клиента после завершения
// ============================================================================

interface MasterReviewSectionProps {
  orderId: string;
  masterId: string;
  clientId: string;
  l2Id: string;
}

function MasterReviewSection({ orderId, masterId, clientId, l2Id }: MasterReviewSectionProps) {
  const { data: myReview, isLoading } = useMyReviewForOrder(orderId, masterId);
  const submitReview = useSubmitReview();
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState("");
  const tc = useThemeColors(["muted-soft", "warning"]);

  if (isLoading) return null;

  if (myReview) {
    return (
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваш отзыв о клиенте
        </AppText>
        <View className="mt-3 rounded-lg border border-hairline bg-surface-2 p-4">
          <View className="flex-row gap-1">
            {[1, 2, 3, 4, 5].map((s) => {
              const filled = s <= myReview.rating;
              return (
                <Star
                  key={s}
                  size={18}
                  weight={filled ? "fill" : "bold"}
                  color={filled ? tc.warning : tc["muted-soft"]}
                />
              );
            })}
          </View>
          {myReview.text && (
            <AppText className="mt-2 text-body-sm text-body">{myReview.text}</AppText>
          )}
        </View>
      </View>
    );
  }

  const isBusy = submitReview.isPending;
  const canSubmit = rating >= 1 && rating <= 5 && !isBusy;

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      await submitReview.mutateAsync({
        orderId,
        authorId: masterId,
        targetId: clientId,
        l2Id,
        rating,
        text,
        direction: "master_to_client",
      });
    } catch (_e) {
      // submitReview.error
    }
  };

  return (
    <View className="mt-10 px-6">
      <AppText weight="semibold" className="text-title-lg text-ink">
        Оцените клиента
      </AppText>
      <AppText className="mt-1 text-body-sm text-muted">
        Ваш отзыв помогает другим мастерам понять, с кем они работают.
      </AppText>

      <View className="mt-4 flex-row gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`${s} звёзд`}
            onPress={() => setRating(s)}
            disabled={isBusy}
            hitSlop={4}
            className="active:opacity-70"
          >
            <Star
              size={36}
              weight={s <= rating ? "fill" : "bold"}
              color={s <= rating ? tc.warning : tc["muted-soft"]}
            />
          </Pressable>
        ))}
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Каким был клиент? Корректно ли описал задачу, оплатил вовремя? (опц.)"
        placeholderTextColor={tc["muted-soft"]}
        multiline
        numberOfLines={3}
        maxLength={2000}
        textAlignVertical="top"
        maxFontSizeMultiplier={1.3}
        className="mt-4 min-h-24 rounded-md border border-hairline bg-canvas px-3 py-3 text-body-md text-ink"
        editable={!isBusy}
      />

      {submitReview.error && (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          {submitReview.error.message}
        </AppText>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={onSubmit}
        className={`mt-4 h-12 items-center justify-center rounded-md ${
          canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
        }`}
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          {isBusy ? "Сохраняем..." : "Оставить отзыв"}
        </AppText>
      </Pressable>
    </View>
  );
}
