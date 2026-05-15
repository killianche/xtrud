import { zodResolver } from "@hookform/resolvers/zod";
import type { IconComponent } from "@/types/icon";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle, CaretLeft, Lock, ChatCenteredText, Tag, UserCheck } from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import { type CreateOrderFormValues, createOrderSchema } from "@/features/orders/order-schema";
import { useCreateOrder } from "@/features/orders/use-create-order";
import { JitSignupSheet } from "@/features/auth/JitSignupSheet";
import { type OrderDraft, useOrderDraftStore } from "@/lib/order-draft-store";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

// Order create — single-screen форма (раньше был 2-шаговый wizard, объединили
// в один экран по фидбэку: пользователь видит весь объём сразу, нет «спрятанных
// полей» на следующем шаге). После публикации — success-экран.

export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);

  // Скрываем нижний TabBar на экране создания заказа — фокус на форме,
  // tabBar отвлекает (это full-screen wizard). Через Zustand-флаг, потому
  // что наш custom TabBar не читает navigation.setOptions({tabBarStyle}).
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );
  const userId = session?.user?.id;
  const params = useLocalSearchParams<{ l2?: string; draft?: string }>();
  // Черновик описания, пришедший с главной (Hero inline-input).
  const initialDraft =
    typeof params.draft === "string" && params.draft.length > 0
      ? decodeURIComponent(params.draft)
      : "";

  const { data: categories } = useVisibleCategories();
  const { data: cities } = useCities();
  const createOrder = useCreateOrder();
  const tc = useThemeColors(["ink", "on-primary", "success", "mute"]);
  // safeBack: при deeplink/refresh уходим на /orders, а не в пустоту.
  const goBack = useSafeBack("/(tabs)/orders" as const);

  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [signupSheetOpen, setSignupSheetOpen] = useState(false);

  // Persisted draft из Zustand — выживает любую навигацию (выбор категории,
  // случайное переключение табов, JIT-signup flow).
  const draft = useOrderDraftStore((s) => s.draft);
  const setDraft = useOrderDraftStore((s) => s.setDraft);
  const clearDraft = useOrderDraftStore((s) => s.clearDraft);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isValid },
  } = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      l2Id: draft.l2Id ?? "",
      title: draft.title ?? initialDraft.slice(0, 80),
      description: draft.description ?? initialDraft,
      cityId: draft.cityId ?? "",
      district: draft.district ?? "",
      urgency: draft.urgency ?? "flexible",
      budgetKind: draft.budgetKind ?? "negotiable",
      budgetValue: draft.budgetValue ?? null,
    },
    mode: "onChange",
  });

  // Pre-fill категории из ?l2= (приходит с master-card CTA "Создать заказ").
  useEffect(() => {
    if (typeof params.l2 === "string" && params.l2.length > 0) {
      setValue("l2Id", params.l2, { shouldValidate: true });
    }
  }, [params.l2, setValue]);

  // Каждое изменение формы → в Zustand. Не теряем при mount/unmount.
  useEffect(() => {
    const sub = watch((values) => {
      setDraft(values as OrderDraft);
    });
    return () => sub.unsubscribe();
  }, [watch, setDraft]);

  const budgetKind = watch("budgetKind");

  // Реальная публикация (предполагает залогиненного пользователя).
  // Отдельная функция от handleSubmit, чтобы её можно было вызвать
  // ИЗ JitSignupSheet после успешного signup (там uid появляется
  // позже, чем handleSubmit замкнётся над текущим userId).
  const publishWithUser = async (uid: string) => {
    const values = getValues();
    try {
      const created = await createOrder.mutateAsync({
        clientId: uid,
        l2Id: values.l2Id,
        title: values.title,
        description: values.description,
        cityId: values.cityId,
        district: values.district,
        urgency: values.urgency,
        budgetKind: values.budgetKind,
        budgetValue: values.budgetKind === "negotiable" ? null : values.budgetValue,
      });
      const newId =
        created && typeof created === "object" && "id" in created
          ? (created as { id: string }).id
          : null;
      clearDraft();
      setCreatedOrderId(newId ?? "submitted");
    } catch (_e) {
      // отображается через createOrder.error
    }
  };

  const onSubmit = handleSubmit(async (_values) => {
    if (!userId) {
      // Анон: открываем JIT-signup sheet. По завершении он сам
      // вызовет onSignedUp(newUserId) → publishWithUser.
      setSignupSheetOpen(true);
      return;
    }
    await publishWithUser(userId);
  });

  const handlePublish = () => void onSubmit();

  const isBusy = createOrder.isPending;
  const submitError = createOrder.error?.message;

  // ============================================================================
  // Success screen после публикации.
  // ============================================================================
  if (createdOrderId) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle size={36} weight="bold" color={tc.success} />
          </View>
          <AppText weight="bold" className="mt-6 text-center text-display-sm text-ink">
            Заявка опубликована
          </AppText>
          <AppText className="mt-3 text-center text-body-md text-muted">
            Мастера получат уведомление и пришлют отклики с ценой и сроком. Это обычно занимает
            15–60 минут.
          </AppText>
        </View>

        <View className="mt-10 w-full gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)/orders" as never)}
            className="h-12 items-center justify-center rounded-md bg-primary active:opacity-80"
          >
            <AppText weight="semibold" className="text-button" style={{ color: tc["on-primary"] }}>
              К моим заказам
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={goBack}
            hitSlop={8}
            className="h-10 items-center justify-center"
          >
            <AppText weight="medium" className="text-body-md text-muted">
              Закрыть
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  // ============================================================================
  // Single-screen форма.
  // ============================================================================

  const canSubmit = isValid && !!cities;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      {/* Header: только back (progress убран — single-screen форма). */}
      <View className="flex-row items-center px-3 py-1 pb-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={20} weight="bold" color={tc.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — Vercel value-card. Eyebrow (mono) → H1 → subtitle → 3-step
            row (Pencil / ChatCenteredText / Lock — все 3 согласованы с privacy
            обещанием) → выделенная privacy-плашка снизу.
            Никаких декоративных кругов / случайного violet — чистая
            типографическая иерархия + один акцентный privacy-trust блок. */}
        <View className="px-6 pb-8">
          <AppText
            weight="mono"
            className="text-mono-caption text-mute uppercase tracking-widest"
          >
            Новый заказ
          </AppText>
          <AppText
            weight="display"
            className="mt-2 text-display-md text-ink"
          >
            Опишите задачу — мастера отзовутся
          </AppText>

          {/* «Как это работает» — единая info card с двумя смысловыми блоками:
              сверху 3-step (что получит клиент), снизу privacy-trust (номер скрыт).
              Объединение в одну карточку с внутренним hairline-divider создаёт
              визуальную гармонию: оба блока — части одного нарратива «как заказ
              работает», а не два разных компонента. */}
          <View className="mt-6 rounded-xl border border-hairline bg-canvas-soft overflow-hidden">
            <View className="flex-row items-start gap-2 px-5 py-5">
              <StepItem icon={ChatCenteredText} label="Получите отклики" />
              <StepItem icon={Tag} label="Посмотрите цены от мастеров" />
              <StepItem icon={UserCheck} label="Выберите подходящего" />
            </View>

            <View className="h-px bg-hairline" />

            <View className="flex-row items-start gap-3 px-5 py-5">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-ink">
                <Lock size={18} weight="bold" color={tc["on-primary"]} />
              </View>
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-sm text-ink">
                  Ваш номер скрыт от мастеров
                </AppText>
                <AppText className="mt-1 text-caption text-body">
                  Мастера присылают только цену и срок выполнения. Написать или позвонить вам они смогут лишь после того, как вы сами это разрешите.
                </AppText>
              </View>
            </View>
          </View>
        </View>
        {/* /Hero */}

        <OrderFormBody
          control={control}
          errors={errors}
          budgetKind={budgetKind}
          isBusy={isBusy}
          categories={categories}
          cities={cities}
        />

        {submitError && (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              Не удалось создать заказ. {submitError}
            </AppText>
          </View>
        )}

        {/* Submit — один primary CTA на всю ширину (back-кнопка вверху
            закрывает «отмена» интент). Vercel pattern: один conversion target. */}
        <View className="mt-10 px-6">
          <Pressable
            accessibilityRole="button"
            // Анону кнопка тоже доступна — на нажатие открывается JIT-signup sheet.
            // Disabled остаётся только когда форма невалидна или категории ещё грузятся.
            disabled={!canSubmit || isBusy || !categories}
            onPress={handlePublish}
            className={`h-14 items-center justify-center rounded-full ${
              canSubmit && !isBusy && categories
                ? "bg-primary active:opacity-80"
                : "bg-canvas-soft-2"
            }`}
          >
            <AppText
              weight="semibold"
              className="text-button-lg"
              style={{ color: canSubmit && !isBusy && categories ? tc["on-primary"] : tc.mute }}
            >
              {isBusy ? "Публикуем…" : !userId ? "Опубликовать заказ" : "Опубликовать заказ"}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

      {/* JIT-signup sheet — открывается, если анон нажал «Опубликовать».
          После успешного login → автоматически публикует заказ. */}
      <JitSignupSheet
        open={signupSheetOpen}
        onClose={() => setSignupSheetOpen(false)}
        onSignedUp={async (uid) => {
          setSignupSheetOpen(false);
          await publishWithUser(uid);
        }}
      />
    </KeyboardAvoidingView>
  );
}

// ----------------------------------------------------------------------------
// StepItem — единичный пункт в горизонтальном 3-step row hero-блока.
// Tinted circle (canvas-soft-2 + hairline) + Lucide-иконка + 2-строчный label.
// Без декоративного фона — Vercel-эстетика, ink-on-canvas минимализм.
// ----------------------------------------------------------------------------

function StepItem({ icon: Icon, label }: { icon: IconComponent; label: string }) {
  return (
    <View className="flex-1 items-center gap-2">
      {/* Кружок белый (bg-canvas) — выделяется на bg-canvas-soft карточке.
          Размер 40dp согласован с Lock-кружком в privacy-блоке ниже. */}
      <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas border border-hairline">
        <Icon size={18} weight="bold" color="currentColor" className="text-ink" />
      </View>
      <AppText
        weight="medium"
        className="text-caption text-ink text-center"
        numberOfLines={3}
      >
        {label}
      </AppText>
    </View>
  );
}
