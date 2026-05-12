import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, MapPin, MessageSquare, Pencil, Star } from "lucide-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
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
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { orderBudgetModeOptions, urgencyLabel } from "@/features/orders/order-schema";
import { useAcceptResponse } from "@/features/orders/use-accept-response";
import { useCompleteOrder } from "@/features/orders/use-complete-order";
import { type OrderDetail, useOrderDetail } from "@/features/orders/use-order-detail";
import {
  type OrderResponseWithMaster,
  useMyResponseForOrder,
  useOrderResponses,
  useSubmitResponse,
} from "@/features/orders/use-order-responses";
import { useMyReviewForOrder, useSubmitReview } from "@/features/reviews/use-reviews";
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
        </Pressable>
        {isOwner && order?.status === "open" && id && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Редактировать заказ"
            onPress={() => router.push(`/orders/edit/${id}` as never)}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-2 active:opacity-70"
          >
            <Pencil size={16} strokeWidth={1.75} color="#374151" />
          </Pressable>
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
          <OrderInfoBlock order={order} />

          {userId && id && <CompletionSection orderId={id} order={order} userId={userId} />}

          {isOwner && id && order && <ClientResponsesSection orderId={id} order={order} />}
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
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// Order info block — общий для всех
// ============================================================================

interface OrderInfoBlockProps {
  order: NonNullable<ReturnType<typeof useOrderDetail>["data"]>;
}

function OrderInfoBlock({ order }: OrderInfoBlockProps) {
  const clientDisplay =
    [order.client?.first_name, order.client?.last_name].filter(Boolean).join(" ") || "Клиент";
  const clientRating = order.client?.rating_as_client_avg;
  const clientRatingCount = order.client?.rating_as_client_count ?? 0;

  return (
    <View className="px-6">
      {/* Category chip */}
      <View className="self-start rounded-pill bg-surface-2 px-3 py-1">
        <AppText weight="medium" className="text-caption-xs text-body">
          {order.l2?.name_ru ?? order.l2_id}
        </AppText>
      </View>

      <AppText weight="bold" className="mt-3 text-display-sm tracking-tight text-ink">
        {order.title}
      </AppText>

      {/* Meta */}
      <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <AppText className="text-caption text-muted">{urgencyLabel(order.urgency)}</AppText>
        <View className="flex-row items-center gap-1">
          <MapPin size={12} strokeWidth={1.75} color="#71717a" />
          <AppText className="text-caption text-muted">
            {order.city?.name ?? order.city_id}
            {order.district ? ` · ${order.district}` : ""}
          </AppText>
        </View>
      </View>

      {/* Budget */}
      {(order.budget_min !== null || order.budget_max !== null) && (
        <AppText weight="medium" className="mt-3 text-body-md text-ink">
          {formatBudget(order)}
        </AppText>
      )}

      {/* Description */}
      <AppText className="mt-6 text-body-md text-body">{order.description}</AppText>

      {/* Author */}
      <View className="mt-6 flex-row items-center gap-3">
        <Avatar
          url={order.client?.avatar_url ?? null}
          name={clientDisplay}
          seed={order.client?.id ?? order.client_id}
          size="sm"
        />
        <View className="flex-1">
          <AppText className="text-caption text-muted-soft">Заказчик</AppText>
          <AppText weight="medium" className="text-body-sm text-ink">
            {clientDisplay}
          </AppText>
        </View>
        {clientRating != null && clientRatingCount > 0 && (
          <View className="flex-row items-center gap-1">
            <Star size={12} strokeWidth={2} color="#f59e0b" fill="#f59e0b" />
            <AppText weight="semibold" className="text-caption text-ink">
              {clientRating.toFixed(1)}
            </AppText>
            <AppText className="text-caption-xs text-muted">({clientRatingCount})</AppText>
          </View>
        )}
      </View>
    </View>
  );
}

function formatBudget(o: {
  budget_min: number | null;
  budget_max: number | null;
  budget_mode: string;
}): string {
  const fmt = new Intl.NumberFormat("ru-RU");
  if (o.budget_mode === "negotiable") return "Бюджет: договорной";
  if (o.budget_mode === "exact" && o.budget_min !== null) return `${fmt.format(o.budget_min)} ₽`;
  if (o.budget_mode === "range") {
    if (o.budget_min !== null && o.budget_max !== null) {
      return `${fmt.format(o.budget_min)} – ${fmt.format(o.budget_max)} ₽`;
    }
    if (o.budget_min !== null) return `от ${fmt.format(o.budget_min)} ₽`;
    if (o.budget_max !== null) return `до ${fmt.format(o.budget_max)} ₽`;
  }
  return "Бюджет: договорной";
}

// ============================================================================
// Client responses section — клиент видит отклики на свой заказ
// ============================================================================

interface ClientResponsesSectionProps {
  orderId: string;
  order: OrderDetail;
}

function ClientResponsesSection({ orderId, order }: ClientResponsesSectionProps) {
  const router = useRouter();
  const { data: responses, isLoading, error } = useOrderResponses(orderId);
  const acceptResponse = useAcceptResponse();

  const hasResponses = (responses?.length ?? 0) > 0;
  const isOpen = order.status === "open";

  return (
    <View className="mt-10 px-6">
      <AppText weight="semibold" className="text-title-lg text-ink">
        Отклики
      </AppText>

      {!isOpen && order.status === "in_progress" && (
        <View className="mt-3 rounded-lg border border-success/30 bg-success-soft p-3">
          <AppText weight="medium" className="text-body-sm text-ink">
            Вы выбрали мастера. Заказ в работе.
          </AppText>
        </View>
      )}

      {isLoading && (
        <View className="mt-3 items-start">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <AppText weight="medium" className="mt-3 text-caption text-error">
          {error.message}
        </AppText>
      )}

      {!isLoading && !error && !hasResponses && (
        <AppText className="mt-3 text-body-sm text-muted">
          Откликов пока нет. Обычно первые приходят в течение часа.
        </AppText>
      )}

      {hasResponses && (
        <View className="mt-4 gap-3">
          {responses?.map((r) => (
            <ClientResponseRow
              key={r.id}
              response={r}
              isPicked={r.master_id === order.picked_master_id}
              canAccept={isOpen && r.status === "sent"}
              isBusy={acceptResponse.isPending}
              onAccept={() =>
                acceptResponse.mutate({
                  responseId: r.id,
                  orderId,
                  clientId: order.client_id,
                })
              }
              onOpenMaster={() => router.push(`/master/${r.master_id}` as never)}
            />
          ))}
        </View>
      )}

      {acceptResponse.error && (
        <AppText weight="medium" className="mt-3 text-caption text-error">
          Не удалось принять отклик. {acceptResponse.error.message}
        </AppText>
      )}
    </View>
  );
}

interface ClientResponseRowProps {
  response: OrderResponseWithMaster;
  isPicked: boolean;
  canAccept: boolean;
  isBusy: boolean;
  onAccept: () => void;
  onOpenMaster: () => void;
}

function ClientResponseRow({
  response,
  isPicked,
  canAccept,
  isBusy,
  onAccept,
  onOpenMaster,
}: ClientResponseRowProps) {
  const masterDisplay =
    [response.master?.first_name, response.master?.last_name].filter(Boolean).join(" ") || "Мастер";

  return (
    <View
      className={`rounded-lg border p-4 ${
        isPicked ? "border-success bg-success-soft" : "border-hairline bg-canvas"
      }`}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={onOpenMaster}
          hitSlop={4}
          className="flex-1 active:opacity-70"
        >
          <AppText weight="semibold" className="text-body-md text-accent">
            {masterDisplay}
          </AppText>
          {isPicked && (
            <AppText weight="medium" className="mt-1 text-caption-xs text-success">
              ВЫБРАН
            </AppText>
          )}
          {response.status === "rejected" && !isPicked && (
            <AppText weight="medium" className="mt-1 text-caption-xs text-muted-soft">
              Выбран другой мастер
            </AppText>
          )}
        </Pressable>
        <AppText weight="medium" className="text-caption text-accent">
          {formatResponsePrice(response)}
        </AppText>
      </View>
      {response.lead_time && (
        <AppText className="mt-1 text-caption text-muted">Срок: {response.lead_time}</AppText>
      )}
      <AppText className="mt-2 text-body-sm text-body">{response.message}</AppText>

      {canAccept && (
        <Pressable
          accessibilityRole="button"
          disabled={isBusy}
          onPress={onAccept}
          className={`mt-3 h-10 items-center justify-center rounded-md ${
            isBusy ? "bg-surface-3" : "bg-primary active:opacity-80"
          }`}
        >
          <AppText weight="semibold" className="text-button text-on-primary">
            {isBusy ? "Принимаем..." : "Принять отклик"}
          </AppText>
        </Pressable>
      )}
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
                    placeholderTextColor="#71717a"
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
                      placeholderTextColor="#71717a"
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
                placeholderTextColor="#71717a"
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
                placeholderTextColor="#71717a"
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

  if (isLoading) return null;

  if (myReview) {
    return (
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваш отзыв
        </AppText>
        <View className="mt-3 rounded-lg border border-hairline bg-surface-2 p-4">
          <View className="flex-row gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <AppText
                key={s}
                weight="bold"
                className={s <= myReview.rating ? "text-warning" : "text-muted-soft"}
              >
                ★
              </AppText>
            ))}
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
            <AppText
              weight="bold"
              className={`text-display-md ${s <= rating ? "text-warning" : "text-muted-soft"}`}
            >
              ★
            </AppText>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Расскажите о работе мастера (опц.)"
        placeholderTextColor="#71717a"
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

  if (isLoading) return null;

  if (myReview) {
    return (
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваш отзыв о клиенте
        </AppText>
        <View className="mt-3 rounded-lg border border-hairline bg-surface-2 p-4">
          <View className="flex-row gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <AppText
                key={s}
                weight="bold"
                className={s <= myReview.rating ? "text-warning" : "text-muted-soft"}
              >
                ★
              </AppText>
            ))}
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
            <AppText
              weight="bold"
              className={`text-display-md ${s <= rating ? "text-warning" : "text-muted-soft"}`}
            >
              ★
            </AppText>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Каким был клиент? Корректно ли описал задачу, оплатил вовремя? (опц.)"
        placeholderTextColor="#71717a"
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
