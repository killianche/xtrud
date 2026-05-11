import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, MapPin, MessageSquare } from "lucide-react-native";
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
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { orderBudgetModeOptions, urgencyLabel } from "@/features/orders/order-schema";
import { useOrderDetail } from "@/features/orders/use-order-detail";
import {
  type OrderResponseWithMaster,
  useMyResponseForOrder,
  useOrderResponses,
  useSubmitResponse,
} from "@/features/orders/use-order-responses";
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
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
        </Pressable>
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

          {isOwner && id && <ClientResponsesSection orderId={id} />}
          {!isOwner && isMasterRole && userId && id && (
            <MasterResponseSection orderId={id} masterId={userId} l2Id={order.l2_id} />
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
      <AppText className="mt-6 text-caption text-muted-soft">Заказчик: {clientDisplay}</AppText>
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
}

function ClientResponsesSection({ orderId }: ClientResponsesSectionProps) {
  const { data: responses, isLoading, error } = useOrderResponses(orderId);
  const hasResponses = (responses?.length ?? 0) > 0;

  return (
    <View className="mt-10 px-6">
      <AppText weight="semibold" className="text-title-lg text-ink">
        Отклики
      </AppText>

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
            <ResponseRow key={r.id} response={r} />
          ))}
        </View>
      )}
    </View>
  );
}

function ResponseRow({ response }: { response: OrderResponseWithMaster }) {
  const masterDisplay =
    [response.master?.first_name, response.master?.last_name].filter(Boolean).join(" ") || "Мастер";

  return (
    <View className="rounded-lg border border-hairline bg-canvas p-4">
      <View className="flex-row items-start justify-between">
        <AppText weight="semibold" className="text-body-md text-ink">
          {masterDisplay}
        </AppText>
        <AppText weight="medium" className="text-caption text-accent">
          {formatResponsePrice(response)}
        </AppText>
      </View>
      {response.lead_time && (
        <AppText className="mt-1 text-caption text-muted">Срок: {response.lead_time}</AppText>
      )}
      <AppText className="mt-2 text-body-sm text-body">{response.message}</AppText>
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
}

function MasterResponseSection({ orderId, masterId, l2Id }: MasterResponseSectionProps) {
  const { data: myResponse, isLoading } = useMyResponseForOrder(orderId, masterId);
  const submitResponse = useSubmitResponse();

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
    return (
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Ваш отклик
        </AppText>
        <View className="mt-3 rounded-lg border border-accent bg-accent-soft p-4">
          <View className="flex-row items-center gap-2">
            <MessageSquare size={16} strokeWidth={2} color="#2563eb" />
            <AppText weight="semibold" className="text-body-md text-accent">
              {responseStatusLabel(myResponse.status)}
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
