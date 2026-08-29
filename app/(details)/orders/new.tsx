import { zodResolver } from "@hookform/resolvers/zod";
import { usePreventRemove } from "@react-navigation/native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle, PencilSimple, WarningCircle } from "phosphor-react-native";
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
import { ActiveOrdersLimitState } from "@/features/orders/ActiveOrdersLimitState";
import { OrderFormBody } from "@/features/orders/OrderFormBody";
import { OrderPhotosPicker } from "@/features/orders/OrderPhotosPicker";
import {
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
import { type CreateOrderFormValues, createOrderSchema } from "@/features/orders/order-schema";
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
  screenPhase?: "intent" | "details";
}

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
  const tc = useThemeColors(["on-primary", "success", "accent", "error"]);
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
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
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
        if (screenPhase === "details") goBackToIntent();
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
        if (screenPhase === "details") goBackToIntent();
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
      setAuthSheetOpen(true);
      return;
    }
    await publishWithUser(userId);
  });

  const handlePublish = () => void onSubmit();

  const isBusy = publishing || createOrder.isPending || uploadingPhotos;
  const showDetails = screenPhase === "details" && !!selectedCategory;
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
              onPress={() => router.replace(`/orders/${createdOrderId}` as never)}
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

  if (screenPhase === "details" && categoriesQuery.isError) {
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить проверку категории"
            onPress={() => void categoriesQuery.refetch()}
            className="mt-6 h-12 min-w-48 items-center justify-center rounded-md border border-hairline bg-canvas px-5 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-body-md text-ink">
              Повторить
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (screenPhase === "details" && !selectedCategory) {
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

  // ============================================================================
  // Adaptive create flow.
  // ============================================================================

  const canSubmit = isValid && !!cities && !!selectedCategory;

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
      <ScreenHeader
        title="Создать задание"
        onBack={showDetails ? goBackToIntent : goBack}
        backDisabled={isBusy}
      />

      {!showDetails ? (
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
              router.push("/orders/new/details" as never);
            }}
          />
        </ScrollView>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            onScroll={onFormScroll}
            scrollEventThrottle={16}
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="px-6 pt-3 pb-7">
              <View className="rounded-lg border border-hairline bg-canvas-soft px-4 py-4">
                <View className="flex-row items-start gap-3">
                  <View className="min-w-0 flex-1">
                    <AppText weight="semibold" className="text-body-md text-ink">
                      {selectedTitle}
                    </AppText>
                    <AppText className="mt-1 text-caption text-mute">
                      {selectedCategory?.name_ru ?? "Категория выбрана"}
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Изменить название или категорию"
                    onPress={goBackToIntent}
                    className="h-11 w-11 items-center justify-center rounded-full active:bg-canvas-soft-2"
                  >
                    <PencilSimple size={20} weight="bold" color={tc.accent} />
                  </Pressable>
                </View>
              </View>
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
              accessibilityState={{ disabled: !canSubmit || isBusy || !categories }}
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
                    : publishing
                      ? "Проверяем…"
                      : "Опубликовать бесплатно"}
              </AppText>
            </Pressable>
          </View>
        </>
      )}

      <PublishAuthSheet open={authSheetOpen} onClose={() => setAuthSheetOpen(false)} />
    </KeyboardAvoidingView>
  );
}

export default function NewOrderIntentRoute() {
  return <NewOrderScreen screenPhase="intent" />;
}
