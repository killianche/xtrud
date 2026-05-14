import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Star,
  Wallet,
} from "lucide-react-native";
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
import { BottomSheet } from "@/components/ui";
import { useMyChats } from "@/features/chat/use-my-chats";
import { useStartChatWithMaster } from "@/features/chat/use-start-chat";
import {
  OutcomeTrackingModal,
  SNOOZE_MS,
  shouldShowOutcomePrompt,
  useOutcomeStore,
} from "@/features/orders/OutcomeTrackingModal";
import { orderBudgetModeOptions, urgencyLabel } from "@/features/orders/order-schema";
import { useAcceptResponse } from "@/features/orders/use-accept-response";
import { useCancelOrder } from "@/features/orders/use-cancel-order";
import { useCompleteOrder } from "@/features/orders/use-complete-order";
import { type OrderDetail, useOrderDetail } from "@/features/orders/use-order-detail";
import {
  type OrderResponseWithMaster,
  useMyResponseForOrder,
  useOrderResponses,
  useSubmitResponse,
} from "@/features/orders/use-order-responses";
import { useMarkResponsesViewed } from "@/features/orders/use-unread-responses";
import { ReportModal } from "@/features/reports/ReportModal";
import { useMyReviewForOrder, useSubmitReview } from "@/features/reviews/use-reviews";
import { useThemeColors } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

// ============================================================================
// Response form schema (для мастера)
// ============================================================================

const responseSchema = z.object({
  message: z.string().min(10, "Минимум 10 символов").max(1000, "Максимум 1000 символов"),
  priceMode: z.enum(orderBudgetModeOptions),
  priceMin: z.number().int().min(0).nullable(),
  priceMax: z.number().int().min(0).nullable(),
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
      {/* Header — чистая навигация. Status переехал в info-block ниже —
          там он по смыслу принадлежит к контенту заказа, а не к навбару.
          В шапке только: back + ⋮ overflow меню. */}
      <View className="flex-row items-center justify-between px-3 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70 hover:bg-canvas-soft"
        >
          <ChevronLeft size={22} strokeWidth={2} color={tc.ink} />
        </Pressable>

        {order && id && userId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Действия с заказом"
            onPress={() => setMenuOpen(true)}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70 hover:bg-canvas-soft"
          >
            <MoreHorizontal size={20} strokeWidth={2} color={tc.ink} />
          </Pressable>
        ) : (
          <View className="w-10" />
        )}
      </View>

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
  const tc = useThemeColors(["ink", "error"]);
  const color = destructive ? tc.error : tc.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-canvas-soft hover:bg-canvas-soft"
    >
      <Icon size={18} strokeWidth={1.75} color={color} />
      <AppText
        weight="medium"
        className={`text-body-md ${destructive ? "text-error" : "text-ink"}`}
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
  const isNegotiable = order.budget_mode === "negotiable";

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

      <AppText
        weight="display"
        className="mt-3 text-display-md tracking-tight text-ink"
      >
        {order.title}
      </AppText>

      {/* Meta row — urgency + location, с иконками */}
      <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} strokeWidth={1.75} color={tc.mute} />
          <AppText className="text-body-sm text-mute">{urgencyLabel(order.urgency)}</AppText>
        </View>
        <AppText className="text-caption text-muted-soft">·</AppText>
        <View className="flex-row items-center gap-1.5">
          <MapPin size={13} strokeWidth={1.75} color={tc.mute} />
          <AppText className="text-body-sm text-mute">
            {order.city?.name ?? order.city_id}
            {order.district ? ` · ${order.district}` : ""}
          </AppText>
        </View>
      </View>

      {/* Budget hero — крупно, mono. Это первая цифра, на которую смотрит мастер. */}
      {budgetText ? (
        <View className="mt-5 flex-row items-center gap-2">
          <Wallet size={18} strokeWidth={1.75} color={tc.ink} />
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
              <Star size={13} strokeWidth={2} color={tc.warning} fill={tc.warning} />
              <AppText weight="mono" className="text-mono-caption text-ink">
                {clientRating.toFixed(1)}
              </AppText>
              <AppText weight="mono" className="text-mono-caption text-mute">
                ({clientRatingCount})
              </AppText>
            </View>
          ) : null}
          <ChevronRight size={16} strokeWidth={1.75} color={tc["muted-soft"]} />
        </Pressable>
      ) : null}
    </View>
  );
}

function formatBudget(o: {
  budget_min: number | null;
  budget_max: number | null;
  budget_mode: string;
}): string {
  const fmt = new Intl.NumberFormat("ru-RU");
  if (o.budget_mode === "negotiable") return "Цена договорная";
  if (o.budget_mode === "exact" && o.budget_min !== null) return `${fmt.format(o.budget_min)} ₽`;
  if (o.budget_mode === "range") {
    if (o.budget_min !== null && o.budget_max !== null) {
      return `${fmt.format(o.budget_min)} – ${fmt.format(o.budget_max)} ₽`;
    }
    if (o.budget_min !== null) return `от ${fmt.format(o.budget_min)} ₽`;
    if (o.budget_max !== null) return `до ${fmt.format(o.budget_max)} ₽`;
  }
  return "Цена договорная";
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
  const { data: responses, isLoading, error } = useOrderResponses(orderId);
  const acceptResponse = useAcceptResponse();
  const startChat = useStartChatWithMaster();

  // Точечный pending-state: какой именно мастер сейчас в процессе действия.
  // Без этого `mutation.isPending` triggers loading-state у ВСЕХ карточек,
  // потому что один TanStack mutation общий для всех откликов.
  const [pendingWriteMasterId, setPendingWriteMasterId] = useState<string | null>(null);
  const [pendingAcceptResponseId, setPendingAcceptResponseId] = useState<string | null>(null);

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

  const hasResponses = (responses?.length ?? 0) > 0;
  const isOpen = order.status === "open";
  const pickedResponse = responses?.find((r) => r.master_id === order.picked_master_id);
  const otherResponses = responses?.filter((r) => r.master_id !== order.picked_master_id) ?? [];

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
            {pickedResponse ? "1 выбран" : `${responses?.length ?? 0}`}
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

      {/* Picked master — hero-card зелёный success, видна сразу под заголовком */}
      {pickedResponse ? (
        <ClientMasterResponseCard
          key={pickedResponse.id}
          response={pickedResponse}
          variant="picked"
          chatId={chatId ?? null}
          isBusy={pendingAcceptResponseId === pickedResponse.id}
          isWriting={pendingWriteMasterId === pickedResponse.master_id}
          onAccept={() => onAcceptResponseClick(pickedResponse.id)}
          onOpenMaster={() => router.push(`/master/${pickedResponse.master_id}` as never)}
          onOpenChat={() => {
            if (chatId) router.push(`/chats/${chatId}` as never);
          }}
          onWrite={() => onWriteToMaster(pickedResponse.master_id)}
        />
      ) : null}

      {/* Other responses */}
      {otherResponses.length > 0 ? (
        <View className="mt-3 gap-2">
          {otherResponses.map((r) => (
            <ClientMasterResponseCard
              key={r.id}
              response={r}
              variant={
                r.status === "rejected"
                  ? "rejected"
                  : isOpen && (r.status === "sent" || r.status === "viewed")
                    ? "actionable"
                    : "passive"
              }
              chatId={null}
              isBusy={pendingAcceptResponseId === r.id}
              isWriting={pendingWriteMasterId === r.master_id}
              onAccept={() => onAcceptResponseClick(r.id)}
              onOpenMaster={() => router.push(`/master/${r.master_id}` as never)}
              onWrite={() => onWriteToMaster(r.master_id)}
            />
          ))}
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
  onAccept: () => void;
  onOpenMaster: () => void;
  onOpenChat?: () => void;
  onWrite: () => void;
}

function ClientMasterResponseCard({
  response,
  variant,
  chatId,
  isBusy,
  isWriting,
  onAccept,
  onOpenMaster,
  onOpenChat,
  onWrite,
}: ClientMasterResponseCardProps) {
  const tc = useThemeColors(["ink", "mute", "muted-soft", "warning", "success", "on-primary"]);

  const masterName =
    [response.master?.first_name, response.master?.last_name].filter(Boolean).join(" ") || "Мастер";
  const priceText = formatResponsePrice(response);
  const isNegotiable = response.price_mode === "negotiable";

  const isPicked = variant === "picked";
  const isActionable = variant === "actionable";
  const isRejected = variant === "rejected";

  const cardClassName = isPicked
    ? "rounded-xl border-2 border-success bg-success-soft p-4"
    : "rounded-xl border border-hairline bg-canvas p-4 hover:bg-canvas-soft";

  return (
    <View className={cardClassName} style={isRejected ? { opacity: 0.55 } : undefined}>
      {/* Header — весь row кликабельный → профиль мастера. items-center
          выравнивает avatar по середине с именем (раньше items-start
          ставил аватар выше — некрасиво). */}
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
          <View className="flex-row items-center gap-2">
            <AppText
              weight="semibold"
              className="flex-1 text-body-md text-ink"
              numberOfLines={1}
            >
              {masterName}
            </AppText>
            {isPicked ? (
              <View className="rounded-full bg-success px-2 py-0.5">
                <AppText
                  weight="bold"
                  className="text-caption-xs"
                  style={{ color: tc["on-primary"] }}
                >
                  ВЫБРАН
                </AppText>
              </View>
            ) : null}
          </View>

          {/* Price row — крупная цена справа, срок (если есть) слева */}
          <View className="mt-0.5 flex-row items-center justify-between gap-2">
            {response.lead_time ? (
              <View className="flex-row items-center gap-1">
                <Clock size={12} strokeWidth={1.75} color={tc["muted-soft"]} />
                <AppText className="text-caption text-mute" numberOfLines={1}>
                  {response.lead_time}
                </AppText>
              </View>
            ) : (
              <View />
            )}
            <AppText
              weight={isNegotiable ? "semibold" : "mono"}
              className={`${isNegotiable ? "text-body-sm" : "text-title-sm"} text-ink`}
            >
              {priceText}
            </AppText>
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
          Вы выбрали другого мастера
        </AppText>
      ) : null}

      {/* Action row — две основные пары:
          - picked: «Открыть чат» (primary ink) + «Завершить» (тут оставляем
            «Открыть чат» single, без дублирующего «Профиль»)
          - actionable (есть отклик, можно нанять):
            «Написать» (secondary, для уточняющих вопросов) +
            «Выбрать мастера» (primary success-green — позитив-commit) */}
      {isPicked && chatId && onOpenChat ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenChat}
          className="mt-4 h-11 flex-row items-center justify-center gap-2 rounded-pill bg-ink active:opacity-80"
        >
          <MessageSquare size={16} strokeWidth={2} color={tc["on-primary"]} />
          <AppText weight="semibold" className="text-button text-on-primary">
            Открыть чат
          </AppText>
        </Pressable>
      ) : isActionable ? (
        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={isWriting}
            onPress={onWrite}
            className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
          >
            {isWriting ? (
              <ActivityIndicator size="small" color={tc.ink} />
            ) : (
              <>
                <MessageSquare size={15} strokeWidth={2} color={tc.ink} />
                <AppText weight="semibold" className="text-button text-ink">
                  Написать
                </AppText>
              </>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onAccept}
            className={`h-11 flex-1 flex-row items-center justify-center gap-2 rounded-pill ${
              isBusy ? "bg-canvas-soft-2" : "bg-success active:opacity-85"
            }`}
            style={{ shadowColor: tc.success, shadowOpacity: 0.25, shadowRadius: 8 }}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={tc["mute"]} />
            ) : (
              <>
                <CheckCircle2 size={15} strokeWidth={2.25} color={tc["on-primary"]} />
                <AppText
                  weight="semibold"
                  className="text-button"
                  style={{ color: tc["on-primary"] }}
                >
                  Выбрать мастера
                </AppText>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function formatResponsePrice(r: Tables<"order_responses">): string {
  const fmt = new Intl.NumberFormat("ru-RU");
  if (r.price_mode === "negotiable") return "Договорная";
  if (r.price_mode === "exact" && r.price_min !== null) return `${fmt.format(r.price_min)} ₽`;
  if (r.price_mode === "range") {
    if (r.price_min !== null && r.price_max !== null) {
      return `${fmt.format(r.price_min)} – ${fmt.format(r.price_max)} ₽`;
    }
    if (r.price_min !== null) return `от ${fmt.format(r.price_min)} ₽`;
    if (r.price_max !== null) return `до ${fmt.format(r.price_max)} ₽`;
  }
  return "Договорная";
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
  const tc = useThemeColors(["muted-soft"]);

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
      priceMode: "negotiable",
      priceMin: null,
      priceMax: null,
      leadTime: "",
    },
    mode: "onChange",
  });

  const priceMode = watch("priceMode");
  const isBusy = submitResponse.isPending;
  const submitError = submitResponse.error?.message;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await submitResponse.mutateAsync({
        orderId,
        masterId,
        l2Id,
        priceMin: values.priceMin,
        priceMax: values.priceMax,
        priceMode: values.priceMode,
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

    return (
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваш отклик
        </AppText>
        <View className={`mt-3 rounded-lg border ${accentClass} p-4`}>
          <View className="flex-row items-center gap-2">
            <MessageSquare size={16} strokeWidth={2} color={iconColor} />
            <AppText weight="semibold" className={`text-body-md ${textColor}`}>
              {isPickedMaster ? "Клиент выбрал вас 🎉" : responseStatusLabel(myResponse.status)}
            </AppText>
          </View>
          <AppText weight="medium" className="mt-2 text-body-md text-ink">
            {formatResponsePrice(myResponse)}
          </AppText>
          {myResponse.lead_time && (
            <AppText className="mt-1 text-caption text-muted">Срок: {myResponse.lead_time}</AppText>
          )}
          <AppText className="mt-2 text-body-sm text-body">{myResponse.message}</AppText>
        </View>
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
          name="priceMode"
          render={({ field: { value, onChange } }) => (
            <View className="mt-2 flex-row flex-wrap gap-2">
              {orderBudgetModeOptions.map((m) => {
                const selected = value === m;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={isBusy}
                    onPress={() => onChange(m)}
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
                      {m === "exact" ? "Точная" : m === "range" ? "Диапазон" : "Договорная"}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}
        />
        {priceMode !== "negotiable" && (
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <Controller
                control={control}
                name="priceMin"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    value={value === null ? "" : String(value)}
                    onBlur={onBlur}
                    onChangeText={(raw) => {
                      const cleaned = raw.replace(/\D/g, "");
                      onChange(cleaned === "" ? null : Number.parseInt(cleaned, 10));
                    }}
                    placeholder={priceMode === "exact" ? "Сумма, ₽" : "От, ₽"}
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
            {priceMode === "range" && (
              <View className="flex-1">
                <Controller
                  control={control}
                  name="priceMax"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value === null ? "" : String(value)}
                      onBlur={onBlur}
                      onChangeText={(raw) => {
                        const cleaned = raw.replace(/\D/g, "");
                        onChange(cleaned === "" ? null : Number.parseInt(cleaned, 10));
                      }}
                      placeholder="До, ₽"
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

      {submitError && (
        <AppText weight="medium" className="text-caption text-error">
          Не удалось отправить отклик. {submitError}
        </AppText>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!isValid || isBusy}
        onPress={onSubmit}
        className={`h-12 items-center justify-center rounded-md ${
          isValid && !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
        }`}
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          {isBusy ? "Отправляем..." : "Отправить отклик"}
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

function CompletionSection({ orderId, order, userId }: CompletionSectionProps) {
  const completeOrder = useCompleteOrder();
  const canComplete =
    order.status === "in_progress" &&
    (order.client_id === userId || order.picked_master_id === userId);

  if (!canComplete) return null;

  const isBusy = completeOrder.isPending;

  return (
    <View className="mt-6 px-6">
      <Pressable
        accessibilityRole="button"
        disabled={isBusy}
        onPress={() => completeOrder.mutate({ orderId, userId })}
        className={`h-12 items-center justify-center rounded-md border ${
          isBusy
            ? "border-hairline bg-surface-3"
            : "border-success bg-success-soft active:opacity-80"
        }`}
      >
        <AppText weight="semibold" className="text-button text-success">
          {isBusy ? "Сохраняем..." : "Работа выполнена"}
        </AppText>
      </Pressable>
      {completeOrder.error && (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          {completeOrder.error.message}
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
                  strokeWidth={1.75}
                  color={filled ? tc.warning : tc["muted-soft"]}
                  fill={filled ? tc.warning : "transparent"}
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
              strokeWidth={1.75}
              color={s <= rating ? tc.warning : tc["muted-soft"]}
              fill={s <= rating ? tc.warning : "transparent"}
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
                  strokeWidth={1.75}
                  color={filled ? tc.warning : tc["muted-soft"]}
                  fill={filled ? tc.warning : "transparent"}
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
              strokeWidth={1.75}
              color={s <= rating ? tc.warning : tc["muted-soft"]}
              fill={s <= rating ? tc.warning : "transparent"}
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
