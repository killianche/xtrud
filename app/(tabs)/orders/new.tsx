import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
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

export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: categories } = useVisibleCategories();
  const { data: cities } = useCities();
  const createOrder = useCreateOrder();

  const {
    control,
    handleSubmit,
    watch,
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

  const budgetMode = watch("budgetMode");

  const onSubmit = handleSubmit(async (values) => {
    if (!userId) return;
    try {
      await createOrder.mutateAsync({
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
      router.back();
    } catch (_e) {
      // отображается через createOrder.error
    }
  });

  const isBusy = createOrder.isPending;
  const submitError = createOrder.error?.message;

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

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pb-6">
          <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
            Новая заявка
          </AppText>
          <AppText className="mt-2 text-body-md text-muted">
            Опишите задачу — мастера предложат цену и срок.
          </AppText>
        </View>

        <OrderFormBody
          control={control}
          errors={errors}
          budgetMode={budgetMode}
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

        <View className="mt-8 px-6">
          <Pressable
            accessibilityRole="button"
            disabled={!isValid || isBusy || !userId || !categories || !cities}
            onPress={onSubmit}
            className={`h-12 items-center justify-center rounded-md ${
              isValid && !isBusy && userId && categories && cities
                ? "bg-primary active:opacity-80"
                : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Публикуем..." : "Опубликовать заказ"}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
