import { zodResolver } from "@hookform/resolvers/zod";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle, Lock } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader, Skeleton } from "@/components/ui";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { PublishAuthSheet } from "@/features/auth/PublishAuthSheet";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import { OrderPhotosPicker } from "@/features/orders/OrderPhotosPicker";
import { type CreateOrderFormValues, createOrderSchema } from "@/features/orders/order-schema";
import { useCreateOrder } from "@/features/orders/use-create-order";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { uploadOrderPhotosBatch } from "@/lib/image-upload";
import { consumeInitialRouteDraft, isOrderDraftUiReady } from "@/lib/order-draft-policy";
import { type OrderDraft, useOrderDraftStore } from "@/lib/order-draft-store";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useSafeBack } from "@/lib/use-safe-back";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";
import { useThemeColors } from "@/lib/use-theme-color";

// Task create — single-screen форма (раньше был 2-шаговый wizard, объединили
// в один экран по фидбэку: пользователь видит весь объём сразу, нет «спрятанных
// полей» на следующем шаге). Auth не публикует автоматически: после возврата
// пользователь повторно подтверждает действие. После публикации — success.

export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);

  // Скрываем нижний TabBar на экране создания задания — фокус на форме,
  // tabBar отвлекает (это full-screen wizard). Через Zustand-флаг, потому
  // что наш custom TabBar не читает navigation.setOptions({tabBarStyle}).
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );
  const userId = session?.user?.id;
  // Профиль — для подстановки имени из регистрации в поле «Ваше имя».
  const { data: user } = useUserRecord(userId);
  const params = useLocalSearchParams<{ l2?: string; draft?: string }>();
  // Черновик описания, пришедший с главной (Hero inline-input).
  const initialDraft =
    typeof params.draft === "string" && params.draft.length > 0
      ? decodeURIComponent(params.draft)
      : "";

  const { data: categories } = useVisibleCategories();
  const { data: cities } = useCities();
  const createOrder = useCreateOrder();
  const tc = useThemeColors(["on-primary", "success"]);
  // safeBack: при deeplink/refresh уходим на /orders, а не в пустоту.
  const goBack = useSafeBack("/(tabs)/orders" as const);
  // Сохраняем позицию прокрутки формы при уходе на выбор категории
  // (/orders/category-select) и возвращаем её обратно — иначе на web
  // форма прыгает в самый верх (см. use-scroll-restoration.ts).
  const { ref: scrollRef, onScroll: onFormScroll } = useScrollRestoration();

  const [published, setPublished] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Persisted draft выживает auth roundtrip и cold reload в пределах 14 дней.
  const draft = useOrderDraftStore((s) => s.draft);
  const setDraft = useOrderDraftStore((s) => s.setDraft);
  const clearDraft = useOrderDraftStore((s) => s.clearDraft);
  const photos = useOrderDraftStore((s) => s.photos);
  const photoSlots = useOrderDraftStore((s) => s.photoSlots);
  const setPhotos = useOrderDraftStore((s) => s.setPhotos);
  const discardPhotoSlots = useOrderDraftStore((s) => s.discardPhotoSlots);
  const hasHydrated = useOrderDraftStore((s) => s.hasHydrated);
  const activeDraftOwnerId = useOrderDraftStore((s) => s.activeOwnerId);
  const appliedDraftOwnerRef = useRef<string | null | undefined>(undefined);
  const [appliedDraftOwnerId, setAppliedDraftOwnerId] = useState<string | null | undefined>(
    undefined,
  );
  const routeDraftAppliedRef = useRef(false);

  // Возврат после login нельзя использовать для обхода onboarding. Целевой
  // экран ждёт профиль: незавершённый flow отправляет на обязательный шаг,
  // завершённый — consume intent и оставляет пользователя у черновика.
  useEffect(() => {
    if (!userId || !user) return;
    const returnUrl = useAuthReturnUrlStore.getState().peekReturnUrl();
    if (returnUrl !== ORDER_CREATE_RETURN_TO) return;
    if (!user.onboarding_completed_at) {
      router.replace("/(onboarding)/client-name" as never);
      return;
    }
    useAuthReturnUrlStore.getState().consumeReturnUrl();
  }, [router, user, userId]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors, isValid },
  } = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      l2Id: draft.l2Id ?? "",
      title: draft.title ?? "",
      contactName: draft.contactName ?? "",
      description: draft.description ?? "",
      cityId: draft.cityId ?? "",
      district: draft.district ?? "",
      // 2026-05-27: без предвыбора. До этого был «flexible» / «negotiable» —
      // пользователь не выбирал и отправлял задание как есть, 90% заданий
      // становились «Не срочно / Договорная» и отбивали мастеров. Теперь
      // null до явного тапа по chip'у, submit блокируется через superRefine.
      urgency: draft.urgency ?? null,
      budgetKind: draft.budgetKind ?? null,
      budgetValue: draft.budgetValue ?? null,
      preferredDate: draft.preferredDate ?? null,
    },
    mode: "onChange",
  });

  // Auth owner может смениться, пока экран уже смонтирован. Reset выполняется
  // до новой watch-подписки, чтобы значения аккаунта A не записались в snapshot B.
  useEffect(() => {
    if (
      !hasHydrated ||
      activeDraftOwnerId === undefined ||
      appliedDraftOwnerRef.current === activeDraftOwnerId
    ) {
      return;
    }
    const restored = useOrderDraftStore.getState().draft;
    const routeDraft = consumeInitialRouteDraft(initialDraft, routeDraftAppliedRef.current);
    routeDraftAppliedRef.current = routeDraft.nextApplied;
    reset({
      l2Id:
        typeof params.l2 === "string" && params.l2.length > 0 ? params.l2 : (restored.l2Id ?? ""),
      title: restored.title ?? routeDraft.value.slice(0, 80),
      contactName: restored.contactName ?? "",
      description: restored.description ?? routeDraft.value,
      cityId: restored.cityId ?? "",
      district: restored.district ?? "",
      urgency: restored.urgency ?? null,
      budgetKind: restored.budgetKind ?? null,
      budgetValue: restored.budgetValue ?? null,
      preferredDate: restored.preferredDate ?? null,
    });
    appliedDraftOwnerRef.current = activeDraftOwnerId;
    setAppliedDraftOwnerId(activeDraftOwnerId);
  }, [activeDraftOwnerId, hasHydrated, initialDraft, params.l2, reset]);

  const draftUiReady = isOrderDraftUiReady(hasHydrated, activeDraftOwnerId, appliedDraftOwnerId);

  // Pre-fill категории из ?l2= (приходит с master-card CTA «Создать задание»).
  useEffect(() => {
    if (draftUiReady && typeof params.l2 === "string" && params.l2.length > 0) {
      setValue("l2Id", params.l2, { shouldValidate: true });
    }
  }, [draftUiReady, params.l2, setValue]);

  // Подставляем имя из регистрации в «Ваше имя» — только если пользователь
  // ещё не вводил/не стирал его (draft.contactName === undefined). Эффект
  // самозавершается: после setValue watch запишет draft.contactName. Если
  // оставить пусто — при просмотре задания всё равно покажется рег-имя.
  useEffect(() => {
    if (!draftUiReady || draft.contactName !== undefined || !user) return;
    const regName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    if (regName) setValue("contactName", regName);
  }, [draftUiReady, user, draft.contactName, setValue]);

  // Каждое изменение формы → в Zustand. Не теряем при mount/unmount.
  useEffect(() => {
    if (
      !hasHydrated ||
      activeDraftOwnerId === undefined ||
      appliedDraftOwnerRef.current !== activeDraftOwnerId
    ) {
      return;
    }
    const sub = watch((values) => {
      setDraft(values as OrderDraft);
    });
    return () => sub.unsubscribe();
  }, [activeDraftOwnerId, hasHydrated, watch, setDraft]);

  const budgetKind = watch("budgetKind");

  // Реальная публикация вызывается только из явного submit авторизованного
  // пользователя. Auth sheet никогда не вызывает эту функцию автоматически.
  const publishWithUser = async (uid: string) => {
    const values = getValues();
    setPhotoError(null);
    try {
      // 1. Фото грузим первыми — нужны их публичные URL для записи в задание.
      //    Если хоть одно не загрузилось — не создаём задание, просим повторить
      //    (лучше явная ошибка, чем задание с «дырявой» галереей).
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        setUploadingPhotos(true);
        const results = await uploadOrderPhotosBatch(
          uid,
          photos.map((p) => ({ uri: p.uri, width: p.width, height: p.height })),
        );
        setUploadingPhotos(false);
        if (results.some((r) => !r.ok)) {
          setPhotoError("Не удалось загрузить фото. Попробуйте ещё раз.");
          return;
        }
        photoUrls = results.flatMap((r) => (r.ok ? [r.publicUrl] : []));
      }

      // 2. Создаём задание с готовыми URL фото.
      // urgency / budgetKind nullable в schema, но zod-валидация (superRefine)
      // гарантирует non-null до submit. Type guard для TS — формальность.
      if (values.urgency === null || values.budgetKind === null) return;
      const created = await createOrder.mutateAsync({
        clientId: uid,
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
      const newId =
        created && typeof created === "object" && "id" in created
          ? (created as { id: string }).id
          : null;
      clearDraft();
      setCreatedOrderId(newId);
      setPublished(true);
    } catch (_e) {
      setUploadingPhotos(false);
      // отображается через createOrder.error
    }
  };

  const onSubmit = handleSubmit(async (_values) => {
    if (!userId) {
      setAuthSheetOpen(true);
      return;
    }
    await publishWithUser(userId);
  });

  const handlePublish = () => void onSubmit();

  const isBusy = createOrder.isPending || uploadingPhotos;
  const submitError = photoError ?? createOrder.error?.message;

  if (!draftUiReady) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Новое задание" onBack={goBack} />
        <View className="gap-6 px-6 pt-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-28 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-full" />
        </View>
      </View>
    );
  }

  // ============================================================================
  // Success screen после публикации.
  // ============================================================================
  if (published) {
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
            Задание опубликовано
          </AppText>
          <AppText className="mt-3 text-center text-body-md text-muted">
            Отклики появятся в разделе «Мои задания».
          </AppText>
        </View>

        <View className="mt-10 w-full gap-3">
          {createdOrderId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(`/(tabs)/orders/${createdOrderId}` as never)}
              className="h-14 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              <AppText weight="semibold" className="text-button-lg text-on-primary">
                Открыть задание
              </AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)/orders" as never)}
            className={`h-14 items-center justify-center rounded-full ${
              createdOrderId ? "border border-hairline bg-canvas" : "bg-primary"
            }`}
          >
            <AppText
              weight="semibold"
              className={`text-button-lg ${createdOrderId ? "text-ink" : "text-on-primary"}`}
            >
              К моим заданиям
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
      {/* Стандартный <ScreenHeader title="Новое задание" /> — единый header
          для всех full-screen экранов (см. DESIGN.md §UI patterns 1).
          Раньше был ad-hoc header (h-9 back-кнопка + дублирующий mono-eyebrow
          в hero) — фидбек user 2026-05-16 «у нас есть стандарт, применить». */}
      <ScreenHeader title="Новое задание" onBack={goBack} />

      <ScrollView
        ref={scrollRef}
        onScroll={onFormScroll}
        scrollEventThrottle={16}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — единственный privacy-trust блок (Lock + объяснение что
            номер скрыт). Eyebrow + H1 + 3-step row удалены — контекст экрана
            самоочевиден из ScreenHeader title «Новое задание». */}
        <View className="px-6 pt-3 pb-7">
          {/* Privacy-trust card — единственный info-блок в hero. Airbnb-стиль:
              мягкая rounded-2xl плашка, ink-кружок с замком, заголовок body-md +
              читаемое тело body-sm. Это блок-доверие (контент), не подзаголовок
              экрана — §G не нарушается. */}
          <View className="rounded-2xl border border-hairline bg-canvas-soft">
            <View className="flex-row items-start gap-3.5 px-5 py-5">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-ink">
                <Lock size={20} weight="bold" color={tc["on-primary"]} />
              </View>
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Ваш номер скрыт
                </AppText>
                <AppText className="mt-1.5 text-body-sm text-body">
                  Мастера видят только задание. Связываетесь только вы.
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
          preferredDate={watch("preferredDate")}
          setPreferredDate={(d) => setValue("preferredDate", d, { shouldValidate: true })}
          isBusy={isBusy}
          categories={categories}
          cities={cities}
          photosSlot={
            <>
              {photos.length === 0 && photoSlots.length > 0 ? (
                <View
                  accessibilityLiveRegion="polite"
                  className="mx-6 mt-6 rounded-lg border border-warning bg-warning-soft px-4 py-4"
                >
                  <AppText weight="semibold" className="text-body-sm text-ink">
                    Фото нужно добавить снова
                  </AppText>
                  <AppText className="mt-1 text-caption text-body">
                    После перезапуска приложения локальные фото не хранятся. Поля задания сохранены.
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={discardPhotoSlots}
                    className="mt-2 min-h-11 self-start justify-center"
                  >
                    <AppText weight="semibold" className="text-body-sm text-ink underline">
                      Продолжить без фото
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
              <OrderPhotosPicker photos={photos} onChange={setPhotos} disabled={isBusy} />
            </>
          }
        />

        {submitError && (
          <View className="mt-6 px-6">
            <AppText
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              weight="medium"
              className="text-caption text-error"
            >
              Не удалось опубликовать задание. {submitError}
            </AppText>
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom CTA bar (Airbnb / depop / google-maps паттерн): главная
          кнопка всегда на виду в нижней панели с hairline-разделителем сверху,
          а не теряется в конце прокрутки. Один conversion target. */}
      <View
        className="border-t border-hairline bg-canvas px-6 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          accessibilityRole="button"
          // Гостю кнопка тоже доступна — на нажатие открывается auth sheet.
          // Disabled остаётся только когда форма невалидна или категории ещё грузятся.
          disabled={!canSubmit || isBusy || !categories}
          onPress={handlePublish}
          className={`h-14 items-center justify-center rounded-full ${
            canSubmit && !isBusy && categories ? "bg-primary active:opacity-80" : "bg-canvas-soft-2"
          }`}
        >
          <AppText
            weight="semibold"
            className={`text-button-lg ${
              canSubmit && !isBusy && categories ? "text-on-primary" : "text-mute"
            }`}
          >
            {uploadingPhotos
              ? "Загружаем фото…"
              : createOrder.isPending
                ? "Публикуем…"
                : "Опубликовать задание"}
          </AppText>
        </Pressable>
      </View>

      <PublishAuthSheet open={authSheetOpen} onClose={() => setAuthSheetOpen(false)} />
    </KeyboardAvoidingView>
  );
}
