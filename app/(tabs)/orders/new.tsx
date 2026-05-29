import { zodResolver } from "@hookform/resolvers/zod";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle, Lock } from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import {
  type LocalOrderPhoto,
  OrderPhotosPicker,
} from "@/features/orders/OrderPhotosPicker";
import { type CreateOrderFormValues, createOrderSchema } from "@/features/orders/order-schema";
import { useCreateOrder } from "@/features/orders/use-create-order";
import { uploadOrderPhotosBatch } from "@/lib/image-upload";
import { JitSignupSheet } from "@/features/auth/JitSignupSheet";
import { type OrderDraft, useOrderDraftStore } from "@/lib/order-draft-store";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useSafeBack } from "@/lib/use-safe-back";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";
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
  const tc = useThemeColors(["ink", "on-primary", "success", "mute"]);
  // safeBack: при deeplink/refresh уходим на /orders, а не в пустоту.
  const goBack = useSafeBack("/(tabs)/orders" as const);
  // Сохраняем позицию прокрутки формы при уходе на выбор категории
  // (/orders/category-select) и возвращаем её обратно — иначе на web
  // форма прыгает в самый верх (см. use-scroll-restoration.ts).
  const { ref: scrollRef, onScroll: onFormScroll } = useScrollRestoration();

  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [signupSheetOpen, setSignupSheetOpen] = useState(false);
  // Локально выбранные фото заказа (до 5). Грузятся в Storage при публикации,
  // не сразу при выборе — см. publishWithUser + uploadOrderPhotosBatch.
  const [photos, setPhotos] = useState<LocalOrderPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
      contactName: draft.contactName ?? "",
      description: draft.description ?? initialDraft,
      cityId: draft.cityId ?? "",
      district: draft.district ?? "",
      // 2026-05-27: без предвыбора. До этого был «flexible» / «negotiable» —
      // пользователь не выбирал и отправлял заказ как есть, 90% заказов
      // становились «Не срочно / Договорная» и отбивали мастеров. Теперь
      // null до явного тапа по chip'у, submit блокируется через superRefine.
      urgency: draft.urgency ?? null,
      budgetKind: draft.budgetKind ?? null,
      budgetValue: draft.budgetValue ?? null,
      preferredDate: draft.preferredDate ?? null,
    },
    mode: "onChange",
  });

  // Pre-fill категории из ?l2= (приходит с master-card CTA "Создать заказ").
  useEffect(() => {
    if (typeof params.l2 === "string" && params.l2.length > 0) {
      setValue("l2Id", params.l2, { shouldValidate: true });
    }
  }, [params.l2, setValue]);

  // Подставляем имя из регистрации в «Ваше имя» — только если пользователь
  // ещё не вводил/не стирал его (draft.contactName === undefined). Эффект
  // самозавершается: после setValue watch запишет draft.contactName. Если
  // оставить пусто — при просмотре заказа всё равно покажется рег-имя.
  useEffect(() => {
    if (draft.contactName !== undefined || !user) return;
    const regName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    if (regName) setValue("contactName", regName);
  }, [user, draft.contactName, setValue]);

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
    setPhotoError(null);
    try {
      // 1. Фото грузим первыми — нужны их публичные URL для записи в заказ.
      //    Если хоть одно не загрузилось — не создаём заказ, просим повторить
      //    (лучше явная ошибка, чем заказ с «дырявой» галереей).
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

      // 2. Создаём заказ с готовыми URL фото.
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
      setCreatedOrderId(newId ?? "submitted");
    } catch (_e) {
      setUploadingPhotos(false);
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

  const isBusy = createOrder.isPending || uploadingPhotos;
  const submitError = photoError ?? createOrder.error?.message;

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
            Мастера получат уведомление и пришлют отклики с ценой и сроком. Мы
            сообщим, как только кто-то откликнется.
          </AppText>
        </View>

        <View className="mt-10 w-full gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)/orders" as never)}
            className="h-14 items-center justify-center rounded-full bg-primary active:opacity-80"
          >
            <AppText weight="semibold" className="text-button-lg text-on-primary">
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
      {/* Стандартный <ScreenHeader title="Новый заказ" /> — единый header
          для всех full-screen экранов (см. DESIGN.md §UI patterns 1).
          Раньше был ad-hoc header (h-9 back-кнопка + дублирующий mono-eyebrow
          в hero) — фидбек user 2026-05-16 «у нас есть стандарт, применить». */}
      <ScreenHeader title="Новый заказ" onBack={goBack} />

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
            самоочевиден из ScreenHeader title «Новый заказ». */}
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
                  Ваш номер скрыт от мастеров
                </AppText>
                <AppText className="mt-1.5 text-body-sm text-body">
                  Они видят только заказ. Вы сами решаете, кому звонить.
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
            <OrderPhotosPicker photos={photos} onChange={setPhotos} disabled={isBusy} />
          }
        />

        {submitError && (
          <View className="mt-6 px-6">
            <AppText weight="medium" className="text-caption text-error">
              Не удалось создать заказ. {submitError}
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
            className={`text-button-lg ${
              canSubmit && !isBusy && categories ? "text-on-primary" : "text-mute"
            }`}
          >
            {uploadingPhotos
              ? "Загружаем фото…"
              : createOrder.isPending
                ? "Публикуем…"
                : "Опубликовать заказ"}
          </AppText>
        </Pressable>
      </View>

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

