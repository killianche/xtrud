import { zodResolver } from "@hookform/resolvers/zod";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { CaretLeft, CaretRight, CheckCircle, WarningCircle } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { Button, ScreenHeader, Skeleton } from "@/components/ui";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { ActiveOrdersLimitState } from "@/features/orders/ActiveOrdersLimitState";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import { OrderPhotosPicker } from "@/features/orders/OrderPhotosPicker";
import {
  isOrderDetailsPhase,
  type OrderCreatePhase,
  shouldAutoResumeOrderDraft,
  shouldRedirectInvalidOrderDetails,
} from "@/features/orders/order-create-route-policy";
import {
  ActiveOrderLimitError,
  getOrderPublishCapacity,
} from "@/features/orders/order-publish-capacity";
import { orderPublishFailureMessage } from "@/features/orders/order-publish-error";
import { createOrderPublishFlightGate } from "@/features/orders/order-publish-flight";
import {
  isOrderPublishSuccessVisible,
  resolveCommittedOrderPublishOwner,
} from "@/features/orders/order-publish-owner";
import {
  type CreateOrderFormValues,
  createOrderSchema,
  formatOrderTiming,
  formatPrice,
} from "@/features/orders/order-schema";
import { TaskIntentStep } from "@/features/orders/TaskIntentStep";
import { taskDetailsPrompt } from "@/features/orders/task-details-prompt";
import { useCreateOrder } from "@/features/orders/use-create-order";
import {
  fetchActiveOrderCount,
  useOrderPublishCapacity,
} from "@/features/orders/use-order-publish-capacity";
import {
  validateOrderPublishCategory,
  validateOrderPublishLocation,
} from "@/features/orders/validate-order-publish-category";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { hapticError, hapticSelection, hapticSuccess } from "@/lib/haptics";
import { deleteFromBucket, uploadOrderPhotosBatch } from "@/lib/image-upload";
import {
  canApplyInitialTaskExample,
  consumeInitialRouteDraft,
  isOrderDraftUiReady,
  resolveInitialOrderDraftText,
} from "@/lib/order-draft-policy";
import { type OrderDraft, useOrderDraftStore } from "@/lib/order-draft-store";
import { supabase } from "@/lib/supabase";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useSafeBack } from "@/lib/use-safe-back";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";
import { useThemeColors } from "@/lib/use-theme-color";

// Task create — adaptive flow. The first step starts from the user's own words
// and requires an explicit suggestion/category confirmation. The remaining
// fields stay on one compact scroll screen. Auth never publishes automatically.

interface NewOrderScreenProps {
  screenPhase?: OrderCreatePhase;
}

/** Порядок шагов после «что нужно сделать». Каждый — свой маршрут. */
const STEP_ORDER: readonly Exclude<OrderCreatePhase, "intent">[] = [
  "details",
  "where",
  "when",
  "budget",
  "review",
];

const STEP_ROUTE: Record<Exclude<OrderCreatePhase, "intent">, string> = {
  details: "/orders/new/details",
  where: "/orders/new/where",
  when: "/orders/new/when",
  budget: "/orders/new/budget",
  review: "/orders/new/review",
};

export function NewOrderScreen({ screenPhase = "intent" }: NewOrderScreenProps) {
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
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  // Профиль — для подстановки имени из регистрации в поле «Ваше имя».
  const { data: user } = useUserRecord(userId);
  const params = useLocalSearchParams<{ l2?: string; draft?: string; edit?: string }>();
  // Черновик описания, пришедший с главной (Hero inline-input).
  const initialDraft =
    typeof params.draft === "string" && params.draft.length > 0
      ? decodeURIComponent(params.draft)
      : "";

  const categoriesQuery = useVisibleCategories();
  const categories = categoriesQuery.data;
  const { data: cities } = useCities();
  const createOrder = useCreateOrder();
  const publishCapacity = useOrderPublishCapacity(userId);
  const tc = useThemeColors(["on-primary", "success", "accent", "error", "ink", "mute"]);
  // safeBack: при deeplink/refresh уходим на /orders, а не в пустоту.
  const goBack = useSafeBack("/(tabs)/orders" as const);
  const goBackToIntent = useSafeBack({
    pathname: "/orders/new",
    params: { edit: "1" },
  } as const);
  // Сохраняем позицию прокрутки формы при уходе на выбор категории
  // (/orders/category-select) и возвращаем её обратно — иначе на web
  // форма прыгает в самый верх (см. use-scroll-restoration.ts).
  const { ref: scrollRef, onScroll: onFormScroll } = useScrollRestoration();

  const [publishedForUserId, setPublishedForUserId] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const resumeOwnerRef = useRef<string | null | undefined>(undefined);
  const publishFlightGateRef = useRef(createOrderPublishFlightGate());

  // Persisted draft выживает auth roundtrip и cold reload в пределах 14 дней.
  const draft = useOrderDraftStore((s) => s.draft);
  const setDraft = useOrderDraftStore((s) => s.setDraft);
  const clearDraftForOwner = useOrderDraftStore((s) => s.clearDraftForOwner);
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

  useEffect(() => {
    if (publishedForUserId && publishedForUserId !== userId) {
      setPublishedForUserId(null);
      setCreatedOrderId(null);
    }
  }, [publishedForUserId, userId]);

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
      contactPhone: draft.contactPhone ?? "",
      whatsappPhone: draft.whatsappPhone ?? "",
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

  // Телефон для связи подставляем из аккаунта, если он там есть, — человеку
  // остаётся подтвердить или заменить. Один раз и только в пустое поле: то,
  // что он уже ввёл, не затираем (DECISION владельца 2026-09-06).
  useEffect(() => {
    const phone = user?.contact_phone?.trim();
    if (phone && !getValues("contactPhone")) {
      setValue("contactPhone", phone, { shouldValidate: false });
    }
  }, [user?.contact_phone, getValues, setValue]);

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
    const routeExample = canApplyInitialTaskExample(
      restored,
      photos.length + photoSlots.length,
      routeDraft.value,
    )
      ? routeDraft.value
      : "";
    reset({
      l2Id:
        routeExample.length > 0
          ? ""
          : typeof params.l2 === "string" && params.l2.length > 0
            ? params.l2
            : (restored.l2Id ?? ""),
      title: resolveInitialOrderDraftText(restored.title, routeExample, 80),
      contactName: restored.contactName ?? "",
      contactPhone: restored.contactPhone ?? "",
      whatsappPhone: restored.whatsappPhone ?? "",
      description: resolveInitialOrderDraftText(restored.description, routeExample, 2000),
      cityId: restored.cityId ?? "",
      district: restored.district ?? "",
      urgency: restored.urgency ?? null,
      budgetKind: restored.budgetKind ?? null,
      budgetValue: restored.budgetValue ?? null,
      preferredDate: restored.preferredDate ?? null,
    });
    appliedDraftOwnerRef.current = activeDraftOwnerId;
    setAppliedDraftOwnerId(activeDraftOwnerId);
  }, [
    activeDraftOwnerId,
    hasHydrated,
    initialDraft,
    params.l2,
    photoSlots.length,
    photos.length,
    reset,
  ]);

  const draftUiReady = isOrderDraftUiReady(hasHydrated, activeDraftOwnerId, appliedDraftOwnerId);

  // A restored draft resumes at the details route. Keeping the two steps as
  // real Stack routes makes the header Back and iOS edge-swipe equivalent.
  useEffect(() => {
    const values = getValues();
    const shouldResume = shouldAutoResumeOrderDraft({
      screenPhase,
      editIntentRequested: params.edit === "1",
      draftUiReady,
      ownerAlreadyHandled: resumeOwnerRef.current === activeDraftOwnerId,
      hasValidIntent: values.title.trim().length >= 5 && !!values.l2Id,
    });
    if (!shouldResume) return;
    resumeOwnerRef.current = activeDraftOwnerId;
    router.push("/orders/new/details" as never);
  }, [activeDraftOwnerId, draftUiReady, getValues, params.edit, router, screenPhase]);

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
  const selectedL2Id = watch("l2Id");
  const selectedTitle = watch("title");
  const selectedCategory = categories?.find((category) => category.id === selectedL2Id);

  // URL params and old persisted drafts are hints, not catalogue authority.
  // Until the current visible allowlist confirms L2, details and publish stay closed.
  useEffect(() => {
    if (!draftUiReady || !categories || selectedCategory) return;
    if (selectedL2Id) {
      setValue("l2Id", "", { shouldValidate: true, shouldDirty: true });
    }
    if (
      shouldRedirectInvalidOrderDetails({
        screenPhase,
        draftUiReady,
        categoriesReady: true,
        hasSelectedCategory: false,
        isBusy: publishing || createOrder.isPending || uploadingPhotos,
        isPublished: publishedForUserId === userId,
      })
    ) {
      router.replace("/orders/new" as never);
    }
  }, [
    categories,
    createOrder.isPending,
    draftUiReady,
    publishedForUserId,
    publishing,
    router,
    screenPhase,
    selectedCategory,
    selectedL2Id,
    setValue,
    uploadingPhotos,
    userId,
  ]);

  const cleanupUploadedPhotos = async (paths: readonly string[]) => {
    await Promise.allSettled(
      paths.map((path) => deleteFromBucket({ bucket: "order-photos", path })),
    );
  };

  // Реальная публикация вызывается только из явного submit авторизованного
  // пользователя. Auth sheet никогда не вызывает эту функцию автоматически.
  const publishWithUser = async (uid: string) => {
    if (!publishFlightGateRef.current.tryEnter()) return;
    setPublishing(true);
    const values = getValues();
    setPhotoError(null);
    setPublishError(null);
    let uploadedPaths: string[] = [];
    let committed = false;
    try {
      if (!categories?.some((category) => category.id === values.l2Id)) {
        if (isOrderDetailsPhase(screenPhase)) goBackToIntent();
        setPublishError("Выберите актуальную категорию задания.");
        return;
      }
      if (values.urgency === null || values.budgetKind === null) {
        setPublishError("Заполните обязательные детали задания.");
        return;
      }

      // The on-device catalogue is a read-only release snapshot and may be
      // stale. Revalidate the selected category against the authoritative
      // backend before capacity checks, Storage uploads or the order insert.
      const [publishCategoryIsCurrent, publishLocationIsCurrent] = await Promise.all([
        validateOrderPublishCategory(values.l2Id),
        validateOrderPublishLocation(values.cityId, values.district),
      ]);
      if (!publishCategoryIsCurrent) {
        setValue("l2Id", "", { shouldValidate: true, shouldDirty: true });
        if (isOrderDetailsPhase(screenPhase)) goBackToIntent();
        setPublishError("Категория изменилась. Выберите актуальную категорию задания.");
        return;
      }
      if (!publishLocationIsCurrent) {
        setPublishError("Место задания изменилось. Выберите его заново.");
        return;
      }

      // A second UX precheck runs before any Storage writes. The mutation
      // repeats it immediately before insert; backend atomic enforcement is
      // still a production release gate.
      const capacity = getOrderPublishCapacity(await fetchActiveOrderCount(uid));
      if (!capacity.canPublish) throw new ActiveOrderLimitError(capacity.limit);

      // 1. Фото нужны до insert, но все успешно загруженные paths удаляются
      // best-effort, если batch или последующий insert завершатся ошибкой.
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
        uploadedPaths = results.flatMap((result) => (result.ok ? [result.path] : []));
        if (results.some((r) => !r.ok)) {
          await cleanupUploadedPhotos(uploadedPaths);
          uploadedPaths = [];
          setPhotoError("Не удалось загрузить фото. Попробуйте ещё раз.");
          return;
        }
        photoUrls = results.flatMap((r) => (r.ok ? [r.publicUrl] : []));
      }

      // 2. Создаём задание с готовыми URL фото.
      const created = await createOrder.mutateAsync({
        clientId: uid,
        l2Id: values.l2Id,
        title: values.title,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        whatsappPhone: values.whatsappPhone,
        description: values.description,
        cityId: values.cityId,
        district: values.district,
        urgency: values.urgency,
        preferredDate: values.preferredDate,
        budgetKind: values.budgetKind,
        budgetValue: values.budgetKind === "negotiable" ? null : values.budgetValue,
        photoUrls,
      });
      // From this line the task owns its uploaded photos. No later session/UI
      // failure may delete them or re-enable a second insert attempt.
      committed = true;
      hapticSuccess();
      uploadedPaths = [];
      const newId =
        created && typeof created === "object" && "id" in created
          ? (created as { id: string }).id
          : null;
      clearDraftForOwner(uid);
      // Supabase auth storage changes before our session hook necessarily
      // finishes owner activation and re-renders. Verify both sources so A's
      // deferred result can never appear inside B's session.
      const ownerResolution = await resolveCommittedOrderPublishOwner(
        uid,
        activeUserIdRef.current,
        async () => {
          const {
            data: { session: currentSession },
            error: sessionError,
          } = await supabase.auth.getSession();
          return { userId: currentSession?.user.id, error: sessionError };
        },
      );
      if (ownerResolution === "mismatch") return;
      setCreatedOrderId(ownerResolution === "confirmed" ? newId : null);
      setPublishedForUserId(uid);
    } catch (error) {
      setUploadingPhotos(false);
      if (committed) {
        if (activeUserIdRef.current === uid) {
          setCreatedOrderId(null);
          setPublishedForUserId(uid);
        }
        return;
      }
      if (uploadedPaths.length > 0) await cleanupUploadedPhotos(uploadedPaths);
      hapticError();
      setPublishError(
        error instanceof ActiveOrderLimitError
          ? `У вас уже ${error.limit} активных задания. Закройте одно, чтобы создать новое.`
          : orderPublishFailureMessage(error),
      );
    } finally {
      publishFlightGateRef.current.leave();
      setPublishing(false);
    }
  };

  const onSubmit = handleSubmit(async (_values) => {
    if (!userId) {
      router.push({ pathname: "/orders/publish-auth" } as never);
      return;
    }
    await publishWithUser(userId);
  });

  const handlePublish = () => void onSubmit();

  const isBusy = publishing || createOrder.isPending || uploadingPhotos;
  const inDetails = isOrderDetailsPhase(screenPhase);
  const showDetails = inDetails && !!selectedCategory;
  const published = isOrderPublishSuccessVisible(publishedForUserId, userId);
  const activeLimitTerminal =
    !published && !!userId && !!publishCapacity.data && !publishCapacity.data.canPublish;
  usePreventRemove(!published && !activeLimitTerminal && isBusy, () => {});
  useBackGestureLock(isBusy || published);
  const submitError =
    publishError ??
    photoError ??
    (createOrder.error instanceof ActiveOrderLimitError
      ? `У вас уже ${createOrder.error.limit} активных задания. Закройте одно, чтобы создать новое.`
      : createOrder.error?.message);

  // ==========================================================================
  // Пошаговый flow (DECISION владельца 2026-09-06: «создание задания — с нуля,
  // по образцу TaskRabbit и iOS»).
  //
  // Что взято у TaskRabbit: один вопрос на экран и строгий порядок —
  // что → подробности → где → когда → бюджет → проверка. У Apple («Entering
  // data»): выбор вместо ввода, где можно; разумные значения по умолчанию;
  // кнопка «Далее» включается только когда шаг заполнен; проверка сразу.
  //
  // Каждый шаг — настоящий маршрут Stack, поэтому «назад» и свайп от края
  // делают один POP, а черновик живёт в store и переживает выход.
  // ==========================================================================
  const stepIndex = inDetails ? STEP_ORDER.indexOf(screenPhase as (typeof STEP_ORDER)[number]) : -1;
  const values = watch();
  const stepValid: Record<(typeof STEP_ORDER)[number], boolean> = {
    details: true,
    where: !!values.cityId || !!values.district,
    when: values.urgency !== null && (values.urgency !== "by_date" || !!values.preferredDate),
    budget:
      values.budgetKind !== null &&
      (values.budgetKind === "negotiable" || (values.budgetValue ?? 0) > 0),
    review: isValid && !!cities && !!selectedCategory,
  };
  const goNext = () => {
    const next = stepIndex >= 0 ? STEP_ORDER[stepIndex + 1] : undefined;
    if (!next) return;
    hapticSelection();
    router.push(STEP_ROUTE[next] as never);
  };
  const goToStep = (phase: (typeof STEP_ORDER)[number]) => router.push(STEP_ROUTE[phase] as never);

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

  // После успешной публикации всегда сохраняем success-state. Иначе refetch
  // лимита после третьего задания мог мгновенно заменить подтверждение экраном
  // «лимит достигнут».
  if (!published && userId && publishCapacity.data && !publishCapacity.data.canPublish) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ActiveOrdersLimitState
          limit={publishCapacity.data.limit}
          onBack={goBack}
          onOpenOrders={() => router.replace("/(tabs)/orders" as never)}
        />
      </View>
    );
  }

  if (published) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="items-center">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle size={40} weight="fill" color={tc.success} />
          </View>
          <AppText weight="bold" className="mt-6 text-center text-display-md text-ink">
            Задание опубликовано
          </AppText>
          <AppText className="mt-3 text-center text-body-md text-body">
            Исполнители увидят его в ленте. Отклики появятся в «Моих заданиях» — мы сообщим.
          </AppText>
        </View>

        <View className="mt-10 w-full gap-3">
          {createdOrderId ? (
            <Button
              variant="accent"
              size="lg"
              fullWidth
              onPress={() => router.replace(`/orders/${createdOrderId}` as never)}
            >
              Открыть задание
            </Button>
          ) : null}
          <Button
            variant={createdOrderId ? "secondary" : "accent"}
            size="lg"
            fullWidth
            onPress={() => router.replace("/(tabs)/orders" as never)}
          >
            К моим заданиям
          </Button>
        </View>
      </View>
    );
  }

  if (inDetails && categoriesQuery.isError) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Создать задание" onBack={goBackToIntent} />
        <View className="flex-1 items-center justify-center px-6 pb-24">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-error-soft">
            <WarningCircle size={28} weight="fill" color={tc.error} />
          </View>
          <AppText weight="semibold" className="mt-5 text-center text-title-md text-ink">
            Не удалось проверить категорию
          </AppText>
          <AppText className="mt-2 text-center text-body-sm text-mute">
            Черновик сохранён. Повторите проверку или вернитесь к названию задания.
          </AppText>
          <Button
            variant="secondary"
            size="lg"
            onPress={() => void categoriesQuery.refetch()}
            className="mt-6"
          >
            Повторить
          </Button>
        </View>
      </View>
    );
  }

  if (inDetails && !selectedCategory) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Создать задание" onBack={goBackToIntent} backDisabled={isBusy} />
        <View accessibilityLiveRegion="polite" className="gap-6 px-6 pt-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-full" />
        </View>
      </View>
    );
  }

  // --------------------------------------------------------------------------
  // Шаг 1 — «Что нужно сделать?» (свой экран с поиском и подсказками).
  // --------------------------------------------------------------------------
  if (!showDetails) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top }}
      >
        <StepHeader
          onBack={goBack}
          backDisabled={isBusy}
          step={1}
          total={STEP_ORDER.length + 1}
          inkColor={tc.ink}
        />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TaskIntentStep
            initialQuery={selectedTitle}
            externalError={publishError}
            isBusy={isBusy}
            onConfirm={({ title, l2Id }) => {
              setPublishError(null);
              setValue("title", title, { shouldValidate: true, shouldDirty: true });
              setValue("l2Id", l2Id, { shouldValidate: true, shouldDirty: true });
              hapticSelection();
              router.push("/orders/new/details" as never);
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // --------------------------------------------------------------------------
  // Шаги 2–6 — один вопрос на экран.
  // --------------------------------------------------------------------------
  const phase = screenPhase as (typeof STEP_ORDER)[number];
  const question: Record<(typeof STEP_ORDER)[number], { title: string; hint: string }> = {
    details: {
      title: "Расскажите подробнее",
      hint: "Объём, особенности, что уже есть. Фото помогут оценить работу точнее.",
    },
    where: { title: "Где это?", hint: "Город или район — исполнители ищут задания рядом." },
    when: { title: "Когда нужно?", hint: "Срок помогает исполнителям понять, успеют ли они." },
    budget: {
      title: "Какой бюджет?",
      hint: "Можно указать сумму или оставить договорную — откликнутся с ценой.",
    },
    review: {
      title: "Проверьте задание",
      hint: "Так его увидят исполнители. Всё можно поправить.",
    },
  };
  const isLast = phase === "review";
  const canProceed = isLast ? stepValid.review && !!categories : stepValid[phase];
  const ctaLabel = isLast
    ? uploadingPhotos
      ? "Загружаем фото…"
      : createOrder.isPending
        ? "Публикуем…"
        : publishing
          ? "Проверяем…"
          : "Опубликовать бесплатно"
    : "Далее";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      <StepHeader
        onBack={phase === "details" ? goBackToIntent : () => router.back()}
        backDisabled={isBusy}
        step={stepIndex + 2}
        total={STEP_ORDER.length + 1}
        inkColor={tc.ink}
      />

      <ScrollView
        ref={phase === "details" ? scrollRef : undefined}
        onScroll={phase === "details" ? onFormScroll : undefined}
        scrollEventThrottle={16}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-2 pb-5">
          <AppText weight="bold" className="text-display-md text-ink">
            {question[phase].title}
          </AppText>
          <AppText className="mt-2 text-body-md text-body">{question[phase].hint}</AppText>
        </View>

        {userId && publishCapacity.isError ? (
          <View
            accessibilityLiveRegion="polite"
            className="mx-6 mb-6 rounded-lg border border-warning bg-warning-soft px-4 py-4"
          >
            <AppText weight="semibold" className="text-body-sm text-ink">
              Не удалось проверить лимит заданий
            </AppText>
            <AppText className="mt-1 text-caption text-body">
              Черновик можно заполнить. Перед публикацией проверим ещё раз.
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Повторить проверку лимита заданий"
              onPress={() => void publishCapacity.refetch()}
              className="mt-2 min-h-11 self-start justify-center"
            >
              <AppText weight="semibold" className="text-body-sm text-ink underline">
                Повторить
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {isLast ? (
          <ReviewSummary
            title={selectedTitle}
            categoryName={selectedCategory?.name_ru ?? ""}
            description={values.description}
            photosCount={photos.length}
            locationLabel={
              [
                values.cityId === "all"
                  ? "Вся Ингушетия"
                  : cities?.find((c) => c.id === values.cityId)?.name,
                values.district,
              ]
                .filter(Boolean)
                .join(" · ") || "Не указано"
            }
            timingLabel={
              values.urgency
                ? formatOrderTiming(values.urgency, values.preferredDate)
                : "Не указано"
            }
            budgetLabel={
              values.budgetKind
                ? formatPrice(values.budgetKind, values.budgetValue ?? null)
                : "Не указано"
            }
            onEditIntent={goBackToIntent}
            onEdit={goToStep}
            inkColor={tc.ink}
            muteColor={tc.mute}
          />
        ) : null}

        <OrderFormBody
          control={control}
          errors={errors}
          budgetKind={budgetKind}
          preferredDate={watch("preferredDate")}
          setPreferredDate={(d) => setValue("preferredDate", d, { shouldValidate: true })}
          isBusy={isBusy}
          categories={categories}
          cities={cities}
          hideTitleField
          hideCategoryField
          detailsPlaceholder={taskDetailsPrompt(selectedL2Id)}
          sections={
            phase === "details"
              ? ["description", "photos"]
              : phase === "where"
                ? ["location"]
                : phase === "when"
                  ? ["timing"]
                  : phase === "budget"
                    ? ["budget"]
                    : ["contacts"]
          }
          photosSlot={
            phase === "details" ? (
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
                      После перезапуска приложения локальные фото не хранятся. Поля задания
                      сохранены.
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
            ) : undefined
          }
        />

        {isLast && submitError ? (
          <View className="mt-6 px-6">
            <AppText
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              weight="medium"
              className="text-body-sm text-error"
            >
              Не удалось опубликовать задание. {submitError}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      {/* Главная кнопка шага — всегда внизу, в зоне большого пальца. Включается
          только когда шаг заполнен (Apple, «Entering data»). */}
      <View
        className="border-t border-hairline bg-canvas px-6 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          variant="accent"
          size="lg"
          fullWidth
          disabled={!canProceed || isBusy}
          loading={isLast && isBusy}
          onPress={isLast ? handlePublish : goNext}
          accessibilityLabel={ctaLabel}
        >
          {ctaLabel}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Шапка шага: «назад» и полоса прогресса. Заголовок-вопрос живёт в
 *  содержимом — крупно, как у iOS. */
function StepHeader({
  onBack,
  backDisabled,
  step,
  total,
  inkColor,
}: {
  onBack: () => void;
  backDisabled: boolean;
  step: number;
  total: number;
  inkColor: string;
}) {
  return (
    <View className="pb-2">
      <View className="flex-row items-center px-2" style={{ height: 44 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          accessibilityState={{ disabled: backDisabled }}
          disabled={backDisabled}
          onPress={onBack}
          hitSlop={6}
          className={`h-11 w-11 items-center justify-center rounded-full active:opacity-50 ${
            backDisabled ? "opacity-40" : ""
          }`}
        >
          <CaretLeft size={22} weight="bold" color={inkColor} />
        </Pressable>
        <View className="min-w-0 flex-1 items-center">
          <AppText weight="semibold" className="text-ios-title text-ink">
            Новое задание
          </AppText>
        </View>
        <View className="w-11" />
      </View>
      <OnboardingProgress step={step} total={total} />
    </View>
  );
}

/** Сводка на последнем шаге: каждая строка ведёт на свой шаг. */
function ReviewSummary({
  title,
  categoryName,
  description,
  photosCount,
  locationLabel,
  timingLabel,
  budgetLabel,
  onEditIntent,
  onEdit,
  inkColor,
  muteColor,
}: {
  title: string;
  categoryName: string;
  description: string;
  photosCount: number;
  locationLabel: string;
  timingLabel: string;
  budgetLabel: string;
  onEditIntent: () => void;
  onEdit: (phase: "details" | "where" | "when" | "budget") => void;
  inkColor: string;
  muteColor: string;
}) {
  const rows: Array<{ key: string; label: string; value: string; onPress: () => void }> = [
    { key: "intent", label: categoryName, value: title, onPress: onEditIntent },
    {
      key: "details",
      label: "Подробности",
      value:
        [description.trim() || null, photosCount > 0 ? `${photosCount} фото` : null]
          .filter(Boolean)
          .join(" · ") || "Без описания",
      onPress: () => onEdit("details"),
    },
    { key: "where", label: "Где", value: locationLabel, onPress: () => onEdit("where") },
    { key: "when", label: "Когда", value: timingLabel, onPress: () => onEdit("when") },
    { key: "budget", label: "Бюджет", value: budgetLabel, onPress: () => onEdit("budget") },
  ];
  return (
    <View className="mx-6 mb-8 overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      {rows.map((row, index) => (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}: ${row.value}. Изменить`}
          onPress={row.onPress}
          className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-canvas-soft ${
            index > 0 ? "border-t border-hairline" : ""
          }`}
        >
          <View className="min-w-0 flex-1">
            <AppText className="text-body-sm text-mute">{row.label}</AppText>
            <AppText
              weight={row.key === "intent" ? "bold" : "medium"}
              className={`mt-0.5 ${row.key === "intent" ? "text-title-lg" : "text-body-md"} text-ink`}
              numberOfLines={2}
            >
              {row.value}
            </AppText>
          </View>
          <CaretRight size={18} weight="bold" color={muteColor} />
        </Pressable>
      ))}
      <View className="hidden" style={{ borderColor: inkColor }} />
    </View>
  );
}

export default function NewOrderIntentRoute() {
  return <NewOrderScreen screenPhase="intent" />;
}
