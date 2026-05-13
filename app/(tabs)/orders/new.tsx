import { zodResolver } from "@hookform/resolvers/zod";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, Clock, Lock, type LucideIcon, Pencil, Phone, Users } from "lucide-react-native";
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
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useThemeColors } from "@/lib/use-theme-color";

// Sprint 26 — Order create wizard. 2 шага:
//   1. Описание задачи + категория — всё про «что нужно» на одном экране
//   2. Бюджет, город, район, срочность + Trust «отвечают за ~30 мин»
// После публикации — success-экран, не голый router.back().

type Step = 1 | 2;

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
      title: initialDraft.slice(0, 80),
      description: initialDraft,
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
      // Шаг 1 — описание задачи + выбор категории.
      const ok = await trigger(["title", "description", "l2Id"]);
      if (ok) setStep(2);
      return;
    }
    if (step === 2) {
      // Шаг 2 — финальный submit (условия и место).
      void onSubmit();
    }
  };

  const goBack = () => {
    if (step === 1) {
      router.back();
      return;
    }
    setStep(1);
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
  // step 1: title ≥ 5 + категория выбрана. description опционален.
  // step 2: финальная валидация всей схемы.
  const stepValid =
    step === 1
      ? watchedTitle.length >= 5 &&
        watchedL2.length > 0 &&
        !errors.title &&
        !errors.description &&
        !errors.l2Id
      : isValid && !!cities;

  const stepTitle = step === 1 ? "Что нужно сделать?" : "Условия и место";

  const stepHint =
    step === 1
      ? "Просто опишите задачу своими словами — мастера разберутся."
      : "Бюджет, город, район, срочность.";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      {/* Header: back + progress в одном ряду. Progress занимает оставшееся
          пространство справа от стрелки. По запросу: было 2 строки, стало 1. */}
      <View className="flex-row items-center px-3 py-2 gap-3 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={tc.ink} />
        </Pressable>
        {/* Inline progress без обёртки OnboardingProgress (его px-6 ломает
            горизонтальное выравнивание с back-кнопкой). */}
        <View
          className="flex-1 flex-row gap-1.5 pr-3"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: 2, now: step }}
          accessibilityLabel={`Шаг ${step} из 2`}
        >
          {[1, 2].map((i) => (
            <View
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-hairline"}`}
            />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Заголовок шага — только для step 2/3. На step 1 он дублирует
            3 «как это работает» строки ниже, удалён по запросу. */}
        {step !== 1 && (
          <View className="px-6 pb-6">
            <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
              {stepTitle}
            </AppText>
            <AppText className="mt-2 text-body-md text-muted">{stepHint}</AppText>
          </View>
        )}

        {/* 3 шага «как это работает» — показываем только на step 1.
            Vercel-card стиль: единая bg-canvas-soft карточка с rounded-xl +
            hairline между строк, маленькая иконка в bg-canvas круге +
            заголовок ink + подсказка mute. Caption-заголовок сверху. */}
        {step === 1 && (
          <View className="px-6 pb-8">
            <View className="rounded-xl bg-canvas-soft">
              <HowItWorksRow icon={Pencil} title="Создадим задачу" />
              <View className="h-px bg-hairline mx-4" />
              <HowItWorksRow icon={Users} title="Мастера откликнутся" />
              <View className="h-px bg-hairline mx-4" />
              <HowItWorksRow
                icon={Phone}
                title="Можете позвонить подходящему"
                hint="Мастера не видят ваш номер"
                hintIcon={Lock}
              />
            </View>
          </View>
        )}

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
        {step === 2 && (
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
          {/* «Далее» (step 1) — анон-friendly, требует только валидных полей.
              «Опубликовать заявку» (step 2) — требует userId+categories,
              на финальном submit. LoginWall сработает если user анон. */}
          <Pressable
            accessibilityRole="button"
            disabled={
              !stepValid || isBusy || (step === 2 && (!userId || !categories))
            }
            onPress={goNext}
            className={`h-14 items-center justify-center rounded-full ${
              stepValid && !isBusy && (step !== 2 || (userId && categories))
                ? "bg-primary active:opacity-80"
                : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button" style={{ color: tc["on-primary"] }}>
              {isBusy ? "Публикуем..." : step === 2 ? "Опубликовать заявку" : "Далее"}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ----------------------------------------------------------------------------
// HowItWorksRow — строка внутри Vercel-card «Как это работает».
// Маленькая Lucide-иконка в bg-canvas круге + title ink + hint mute.
// ----------------------------------------------------------------------------

function HowItWorksRow({
  icon: Icon,
  title,
  hint,
  hintIcon: HintIcon,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Маленькая иконка слева от hint'а — для приватных/важных сигналов (Lock). */
  hintIcon?: LucideIcon;
}) {
  return (
    <View className="flex-row items-center gap-4 px-4 py-4">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-canvas shrink-0 text-ink">
        <Icon size={18} strokeWidth={1.75} color="currentColor" />
      </View>
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink">
          {title}
        </AppText>
        {hint && (
          <View className="mt-1 flex-row items-center gap-1.5">
            {HintIcon && (
              <View className="text-mute">
                <HintIcon size={13} strokeWidth={2} color="currentColor" />
              </View>
            )}
            <AppText className="text-body-sm text-mute">{hint}</AppText>
          </View>
        )}
      </View>
    </View>
  );
}
