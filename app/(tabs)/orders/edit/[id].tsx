/**
 * Редактирование заказа клиентом — доступно только пока status='open'.
 * После accept (`in_progress`) и далее — RLS+UI запрещают.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import { type CreateOrderFormValues, createOrderSchema } from "@/features/orders/order-schema";
import { useOrderDetail } from "@/features/orders/use-order-detail";
import { useUpdateOrder } from "@/features/orders/use-update-order";
import { useThemeColor } from "@/lib/use-theme-color";

export default function EditOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : undefined;

  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: order, isLoading } = useOrderDetail(orderId);
  const { data: categories } = useVisibleCategories();
  const { data: cities } = useCities();
  const updateOrder = useUpdateOrder();
  const inkColor = useThemeColor("ink");

  const isOwner = !!userId && !!order && order.client_id === userId;
  const isEditable = !!order && order.status === "open";

  const {
    control,
    handleSubmit,
    watch,
    reset,
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

  // Заполняем форму данными заказа при первой загрузке.
  useEffect(() => {
    if (!order) return;
    reset({
      l2Id: order.l2_id,
      title: order.title,
      description: order.description,
      cityId: order.city_id,
      district: order.district ?? "",
      urgency: order.urgency,
      budgetMode: order.budget_mode,
      budgetMin: order.budget_min,
      budgetMax: order.budget_max,
    });
  }, [order, reset]);

  const budgetMode = watch("budgetMode");

  const onSubmit = handleSubmit(async (values) => {
    if (!orderId || !userId) return;
    try {
      await updateOrder.mutateAsync({
        orderId,
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
      // через updateOrder.error
    }
  });

  const isBusy = updateOrder.isPending;
  const submitError = updateOrder.error?.message;

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
          <ChevronLeft size={24} strokeWidth={1.75} color={inkColor} />
        </Pressable>
      </View>

      {isLoading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}

      {!isLoading && order && !isOwner && (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-body-md text-error">
            Редактировать может только владелец заказа.
          </AppText>
        </View>
      )}

      {!isLoading && order && isOwner && !isEditable && (
        <View className="flex-1 items-center justify-center px-6">
          <AppText className="text-center text-body-md text-muted">
            Заказ нельзя редактировать после принятия отклика.
          </AppText>
        </View>
      )}

      {!isLoading && order && isOwner && isEditable && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-6 pb-6">
            <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
              Редактирование
            </AppText>
            <AppText className="mt-2 text-body-md text-muted">
              Изменения сохранятся сразу. Существующие отклики останутся.
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
                Не удалось сохранить. {submitError}
              </AppText>
            </View>
          )}

          <View className="mt-8 px-6">
            <Pressable
              accessibilityRole="button"
              disabled={!isValid || isBusy || !categories || !cities}
              onPress={onSubmit}
              className={`h-12 items-center justify-center rounded-md ${
                isValid && !isBusy && categories && cities
                  ? "bg-primary active:opacity-80"
                  : "bg-surface-3"
              }`}
            >
              <AppText weight="semibold" className="text-button text-on-primary">
                {isBusy ? "Сохраняем..." : "Сохранить"}
              </AppText>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
