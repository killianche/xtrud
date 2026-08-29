/**
 * Редактирование заказа клиентом — доступно только пока status='open'.
 * После accept (`in_progress`) и далее — RLS+UI запрещают.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
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
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import { type LocalOrderPhoto, OrderPhotosPicker } from "@/features/orders/OrderPhotosPicker";
import { type CreateOrderFormValues, createOrderSchema } from "@/features/orders/order-schema";
import { useOrderDetail } from "@/features/orders/use-order-detail";
import { useUpdateOrder } from "@/features/orders/use-update-order";
import { uploadOrderPhotosBatch } from "@/lib/image-upload";
import { useSafeBack } from "@/lib/use-safe-back";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

/** Это уже загруженное (remote) фото — оставляем URL как есть, не перезагружаем. */
function isRemotePhoto(uri: string): boolean {
  return /^https?:/i.test(uri);
}

export default function EditOrderScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : undefined;

  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: order, isLoading } = useOrderDetail(orderId);
  const { data: categories } = useVisibleCategories();
  const { data: cities } = useCities();
  const updateOrder = useUpdateOrder();
  // safeBack: deeplink/refresh → fallback на сам заказ (если id известен),
  // иначе на /orders.
  const goBack = useSafeBack((orderId ? `/orders/${orderId}` : "/(tabs)/orders") as never);
  // Сохраняем позицию прокрутки при уходе на выбор категории и возвращаем
  // её обратно — иначе на web форма прыгает в верх (use-scroll-restoration.ts).
  const { ref: scrollRef, onScroll: onFormScroll } = useScrollRestoration();

  // Фото заказа: смесь уже загруженных (remote URL) и только что добавленных
  // (локальные). На сохранении грузим только новые, старые оставляем по URL.
  const [photos, setPhotos] = useState<LocalOrderPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const isOwner = !!userId && !!order && order.client_id === userId;
  const isEditable = !!order && order.status === "open";

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isValid, isDirty },
  } = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      l2Id: "",
      title: "",
      contactName: "",
      description: "",
      cityId: "",
      district: "",
      urgency: "flexible",
      budgetKind: "negotiable",
      budgetValue: null,
      preferredDate: null,
    },
    mode: "onChange",
  });

  // Заполняем форму данными заказа при первой загрузке.
  useEffect(() => {
    if (!order) return;
    reset({
      l2Id: order.l2_id,
      title: order.title,
      contactName: order.contact_name ?? "",
      // description в БД nullable (миграция 0090) — в форме это пустая строка.
      description: order.description ?? "",
      // city_id=null означает «Вся Ингушетия» — конвертируем обратно в "all" UI-значение
      cityId: order.city_id ?? "all",
      district: order.district ?? "",
      urgency: order.urgency,
      budgetKind: order.budget_kind,
      budgetValue: order.budget_value,
      preferredDate: order.preferred_date ?? null,
    });
    // Существующие фото → в picker как remote-элементы (width/height неизвестны,
    // не нужны: их не пересжимаем). Порядок сохраняем (обложка = индекс 0).
    const existing = order.photo_urls ?? [];
    setPhotos(
      existing.map((url, i) => ({
        id: `remote-${i}-${url}`,
        uri: url,
        width: 0,
        height: 0,
      })),
    );
  }, [order, reset]);

  const budgetKind = watch("budgetKind");
  const isBusy = updateOrder.isPending || uploadingPhotos;
  const photosDirty =
    !!order && photos.map((photo) => photo.uri).join("\n") !== (order.photo_urls ?? []).join("\n");
  const allowSavedNavigation = useUnsavedChangesGuard({
    hasUnsavedChanges: isDirty || photosDirty,
    isBusy,
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!orderId || !userId) return;
    setPhotoError(null);
    try {
      // 1. Грузим только НОВЫЕ (локальные) фото; старые остаются по своим URL.
      const locals = photos.filter((p) => !isRemotePhoto(p.uri));
      let uploadedByOrder: string[] = [];
      if (locals.length > 0) {
        setUploadingPhotos(true);
        const results = await uploadOrderPhotosBatch(
          userId,
          locals.map((p) => ({ uri: p.uri, width: p.width, height: p.height })),
        );
        setUploadingPhotos(false);
        if (results.some((r) => !r.ok)) {
          setPhotoError("Не удалось загрузить фото. Попробуйте ещё раз.");
          return;
        }
        uploadedByOrder = results.flatMap((r) => (r.ok ? [r.publicUrl] : []));
      }

      // 2. Собираем итоговый список В ПОРЯДКЕ picker'а: remote — как есть,
      //    локальные — заменяем на свежезагруженный publicUrl. Обложка = индекс 0.
      let li = 0;
      const photoUrls = photos.map((p) =>
        isRemotePhoto(p.uri) ? p.uri : (uploadedByOrder[li++] ?? p.uri),
      );

      // urgency / budgetKind nullable в schema, валидация гарантирует non-null.
      if (values.urgency === null || values.budgetKind === null) return;
      await updateOrder.mutateAsync({
        orderId,
        clientId: userId,
        l2Id: values.l2Id,
        title: values.title,
        contactName: values.contactName,
        description: values.description,
        cityId: values.cityId,
        district: values.district,
        urgency: values.urgency,
        preferredDate: values.preferredDate,
        budgetKind: values.budgetKind,
        budgetValue: values.budgetKind === "negotiable" ? null : values.budgetValue,
        photoUrls,
      });
      allowSavedNavigation();
      goBack();
    } catch (_e) {
      setUploadingPhotos(false);
      // через updateOrder.error
    }
  });

  const submitError = photoError ?? updateOrder.error?.message;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      <ScreenHeader title="Редактирование" onBack={goBack} backDisabled={isBusy} />

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
          ref={scrollRef}
          onScroll={onFormScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-6 pb-6">
            <AppText className="mt-2 text-body-md text-muted">
              Изменения сохранятся сразу. Существующие отклики останутся.
            </AppText>
          </View>

          <OrderFormBody
            control={control}
            errors={errors}
            budgetKind={budgetKind}
            preferredDate={watch("preferredDate")}
            setPreferredDate={(d) => setValue("preferredDate", d, { shouldValidate: true })}
            isBusy={isBusy}
            categories={categories}
            cities={cities}
            photosSlot={
              <OrderPhotosPicker photos={photos} onChange={setPhotos} disabled={isBusy} />
            }
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
                {uploadingPhotos
                  ? "Загружаем фото…"
                  : updateOrder.isPending
                    ? "Сохраняем…"
                    : "Сохранить"}
              </AppText>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
