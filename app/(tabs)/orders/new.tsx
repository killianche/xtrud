import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, Clock } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import { type CreateOrderFormValues, createOrderSchema } from "@/features/orders/order-schema";
import { useCreateOrder } from "@/features/orders/use-create-order";
import { useThemeColors } from "@/lib/use-theme-color";

// Sprint 26 — Order create wizard. 3 шага:
//   1. Категория
//   2. Описание задачи (название + детали)
//   3. Бюджет, город, район, срочность + Trust «отвечают за ~30 мин»
// После публикации — success-экран, не голый router.back().

type Step = 1 | 2 | 3;

export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const params = useLocalSearchParams<{ l2?: string }>();

  const { data: categories } = useVisibleCategories();
  const { data: cities } = useCities();
  const createOrder = useCreateOrder();
  const tc = useThemeColors(["ink", "on-primary", "success"]);

  const [step, setStep] = useState<Step>(1);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors, isValid },
  } = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      l2Id: "",
      title: "",
      description: "",
      cityId: "",
      district: "",
      urgency: "flexible",
      budgetMode: "negotiable",
      budgetMin: null,
      budgetMax: null,
    },
    mode: "onChange",
  });

  // Pre-fill категории из ?l2= (приходит с master-card CTA "Создать заказ").
  useEffect(() => {
    if (typeof params.l2 === "string" && params.l2.length > 0) {
      setValue("l2Id", params.l2, { shouldValidate: true });
    }
  }, [params.l2, setValue]);

  const budgetMode = watch("budgetMode");

  const onSubmit = handleSubmit(async (values) => {
    if (!userId) return;
    try {
      const created = await createOrder.mutateAsync({
        clientId: userId,
        l2Id: values.l2Id,
        title: values.title,
        description: values.description,
        cityId: values.cityId,
        district: values.district,
        urgency: values.urgency,
        budgetMode: values.budgetMode,
        budgetMin: values.budgetMode === "negotiable" ? null : values.budgetMin,
        budgetMax: values.budgetMode === "negotiable" ? null : values.budgetMax,
      });
      // useCreateOrder возвращает id созданного заказа.
      const newId =
        created && typeof created === "object" && "id" in created
          ? (created as { id: string }).id
          : null;
      setCreatedOrderId(newId ?? "submitted");
    } catch (_e) {
      // отображается через createOrder.error
    }
  });

  const goNext = async () => {
    if (step === 1) {
      const ok = await trigger("l2Id");
      if (ok) setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await trigger(["title", "description"]);
      if (ok) setStep(3);
      return;
    }
    if (step === 3) {
      void onSubmit();
    }
  };

  const goBack = () => {
    if (step === 1) {
      router.back();
      return;
    }
    setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : 1));
  };

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
            <CheckCircle2 size={36} strokeWidth={1.75} color={tc.success} />
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
            onPress={() => router.back()}
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
  // Wizard step.
  // ============================================================================

  // Локальная per-step валидация для кнопки «Далее».
  // На шаге 3 используем общий isValid (Zod-схема), чтобы Submit прошёл целиком.
  const watchedL2 = watch("l2Id");
  const watchedTitle = watch("title");
  const watchedDesc = watch("description");
  const stepValid =
    step === 1
      ? watchedL2.length > 0
      : step === 2
        ? watchedTitle.length > 0 && !errors.title && watchedDesc.length > 0 && !errors.description
        : isValid && !!cities;

  const stepTitle =
    step === 1 ? "Выберите категорию" : step === 2 ? "Опишите задачу" : "Условия и место";

  const stepHint =
    step === 1
      ? "Это поможет показать заказ нужным мастерам."
      : step === 2
        ? "Короткое название + подробности задачи."
        : "Бюджет, город, район, срочность.";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      {/* Header: back + progress */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={tc.ink} />
        </Pressable>
      </View>
      <View className="pb-4">
        <OnboardingProgress step={step} total={3} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pb-6">
          <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
            {stepTitle}
          </AppText>
          <AppText className="mt-2 text-body-md text-muted">{stepHint}</AppText>
        </View>

        <OrderFormBody
          control={control}
          errors={errors}
          budgetMode={budgetMode}
          isBusy={isBusy}
          categories={categories}
          cities={cities}
          step={step}
        />

        {/* Trust-сигнал на финальном шаге — TaskRabbit pattern. */}
        {step === 3 && (
          <View className="mt-8 mx-6 flex-row items-center gap-3 rounded-lg border border-hairline-soft bg-surface-2 p-4">
            <Clock size={18} strokeWidth={1.75} color={tc.success} />
            <AppText weight="medium" className="flex-1 text-caption text-body">
              Обычно мастера отвечают за 15–60 минут.
            </AppText>
          </View>
        )}

        {submitError && (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              Не удалось создать заказ. {submitError}
            </AppText>
          </View>
        )}

        <View className="mt-8 px-6">
          <Pressable
            accessibilityRole="button"
            disabled={!stepValid || isBusy || !userId || !categories}
            onPress={goNext}
            className={`h-12 items-center justify-center rounded-md ${
              stepValid && !isBusy && userId && categories
                ? "bg-primary active:opacity-80"
                : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button" style={{ color: tc["on-primary"] }}>
              {isBusy ? "Публикуем..." : step === 3 ? "Опубликовать заявку" : "Далее"}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
