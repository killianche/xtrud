/**
 * /orders/new/review — «Проверьте задание»: все ответы строками, каждая
 * открывает свой шаг (TaskRabbit: «изменить любой ответ в любой момент»).
 * Внизу — «Опубликовать» (или «Сохранить» при редактировании).
 *
 * Гость нажимает «Опубликовать» → системная шторка входа (orders/publish-auth);
 * после входа auth-return приводит на /orders/new, а полный черновик — сюда.
 * Пока идёт публикация, «назад» и свайп заблокированы; после успеха экран
 * показывает результат и не даёт опубликовать второй раз.
 */

import { Redirect, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { CheckCircle } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { ActiveOrdersLimitState } from "@/features/orders/ActiveOrdersLimitState";
import { formatOrderTiming, formatPrice } from "@/features/orders/order-schema";
import { useOrderPublishCapacity } from "@/features/orders/use-order-publish-capacity";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import {
  isEditDirty,
  useComposer,
  useComposerSession,
} from "@/features/task-composer/composer-store";
import {
  COMPOSER_ROUTE,
  type ComposerStep,
  isComposerComplete,
} from "@/features/task-composer/steps";
import { useComposerClose } from "@/features/task-composer/use-composer-close";
import { usePublishTask } from "@/features/task-composer/use-publish-task";
import { ALL_INGUSHETIA_CITY_ID, getCityName } from "@/lib/location-config";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useThemeColors } from "@/lib/use-theme-color";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

export default function TaskReviewScreen() {
  const router = useRouter();
  const composer = useComposer();
  const { values, photos, mode } = composer;
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const publish = usePublishTask(mode, userId);
  const capacity = useOrderPublishCapacity(mode.kind === "create" ? userId : undefined);
  const categories = useVisibleCategories();
  const endEdit = useComposerSession((s) => s.endEdit);
  const editDirty = useComposerSession((s) => (s.mode.kind === "edit" ? isEditDirty(s) : false));
  const tc = useThemeColors(["success"]);
  const close = useComposerClose();

  // Сессия редактирования живёт, пока открыт этот экран.
  useEffect(() => {
    if (mode.kind !== "edit") return;
    return () => endEdit();
  }, [mode.kind, endEdit]);

  const done = publish.outcome !== null;
  const limitReached =
    mode.kind === "create" && !done && !!userId && !!capacity.data && !capacity.data.canPublish;
  usePreventRemove(publish.busy, () => {});
  useBackGestureLock(publish.busy || done);
  // Редактирование: уйти с несохранёнными правками можно только осознанно
  // (тот же гвард, что у профиля). После сохранения ничего не держит.
  useUnsavedChangesGuard({ hasUnsavedChanges: editDirty && !done, isBusy: publish.busy });

  // Категория устарела на сервере: сбрасываем её и ведём к первому вопросу с
  // объяснением, а не молча. В редактировании шаг открывается «из проверки».
  const staleHandledRef = useRef(false);
  useEffect(() => {
    if (!publish.categoryStale || staleHandledRef.current) return;
    staleHandledRef.current = true;
    composer.patch({ l2Id: "" });
    if (mode.kind === "edit") {
      router.push({
        pathname: COMPOSER_ROUTE.category,
        params: { from: "review", stale: "1" },
      } as never);
    } else {
      router.replace({ pathname: COMPOSER_ROUTE.category, params: { stale: "1" } } as never);
    }
  }, [publish.categoryStale, composer, mode.kind, router]);

  if (
    composer.ready &&
    mode.kind === "create" &&
    !isComposerComplete(values) &&
    !publish.categoryStale
  ) {
    return <Redirect href="/orders/new" />;
  }
  if (!composer.ready) return null;

  const category = categories.data?.find((c) => c.id === values.l2Id);
  const open = (step: ComposerStep) =>
    router.push({ pathname: COMPOSER_ROUTE[step], params: { from: "review" } } as never);
  const place = values.district
    ? values.district
    : values.cityId === ALL_INGUSHETIA_CITY_ID
      ? "Вся Ингушетия"
      : getCityName(values.cityId);
  const contacts =
    values.contactMode === "phone_open"
      ? [values.contactPhone.trim(), values.whatsappPhone.trim() ? "WhatsApp" : ""]
          .filter(Boolean)
          .join(" · ")
      : "Отклики в приложении";

  const onPrimary = () => {
    if (!userId) {
      router.push("/orders/publish-auth" as never);
      return;
    }
    void publish.run(userId, values, photos);
  };

  if (limitReached && capacity.data) {
    return (
      <ComposerScreen
        step="review"
        title="Лимит заданий"
        onBack={() => router.back()}
        primaryLabel=""
        onPrimary={() => undefined}
        hideActions
      >
        <ActiveOrdersLimitState
          limit={capacity.data.limit}
          onOpenOrders={() => router.replace("/(tabs)/orders" as never)}
          onBack={() => router.back()}
        />
      </ComposerScreen>
    );
  }

  if (publish.outcome) {
    const outcome = publish.outcome;
    return (
      <ComposerScreen
        step="review"
        title={outcome.kind === "saved" ? "Изменения сохранены" : "Задание опубликовано"}
        subtitle={
          outcome.kind === "saved"
            ? undefined
            : "Мастера из этой категории уже получают уведомление. Отклики придут в «Мои задания»."
        }
        onClose={() => router.replace("/(tabs)/orders" as never)}
        primaryLabel=""
        onPrimary={() => undefined}
        hideActions
      >
        <View className="items-center px-5 pt-6">
          <SystemIcon
            sf="checkmark.circle.fill"
            fallback={CheckCircle}
            size={72}
            weight="regular"
            color={tc.success}
          />
          <View className="mt-8 w-full gap-3">
            {outcome.orderId ? (
              <Button
                variant="accent"
                size="lg"
                fullWidth
                onPress={() => router.replace(`/orders/${outcome.orderId}` as never)}
              >
                Открыть задание
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => router.replace("/(tabs)/orders" as never)}
            >
              К моим заданиям
            </Button>
          </View>
        </View>
      </ComposerScreen>
    );
  }

  return (
    <ComposerScreen
      step="review"
      title={mode.kind === "edit" ? "Проверьте изменения" : "Проверьте задание"}
      subtitle="Нажмите строку, чтобы изменить ответ."
      onBack={() => router.back()}
      onClose={mode.kind === "edit" ? undefined : close}
      primaryLabel={mode.kind === "edit" ? "Сохранить" : "Опубликовать"}
      onPrimary={onPrimary}
      busy={publish.busy}
      error={publish.error}
    >
      <ChoiceGroup title="Задание">
        <ChoiceRow
          title="Категория"
          value={category?.name_ru ?? ""}
          navigates
          onPress={() => open("category")}
        />
        <ChoiceRow title={values.title} navigates onPress={() => open("title")} />
        <ChoiceRow
          title="Подробности"
          value={
            [
              values.description.trim() ? "описание" : "",
              photos.length > 0 ? `${photos.length} фото` : "",
            ]
              .filter(Boolean)
              .join(", ") || "Нет"
          }
          navigates
          onPress={() => open("details")}
          last
        />
      </ChoiceGroup>
      <ChoiceGroup title="Условия">
        <ChoiceRow title="Где" value={place} navigates onPress={() => open("where")} />
        <ChoiceRow
          title="Когда"
          value={values.urgency ? formatOrderTiming(values.urgency, values.preferredDate) : ""}
          navigates
          onPress={() => open("when")}
        />
        <ChoiceRow
          title="Бюджет"
          value={values.budgetKind ? formatPrice(values.budgetKind, values.budgetValue) : ""}
          navigates
          onPress={() => open("budget")}
        />
        <ChoiceRow title="Связь" value={contacts} navigates onPress={() => open("contacts")} last />
      </ChoiceGroup>
      <View className="px-9">
        <AppText className="text-ios-footnote text-mute">
          {mode.kind === "edit"
            ? "Изменения увидят мастера, которые уже откликнулись."
            : values.contactMode === "phone_open"
              ? "Задание увидят мастера выбранной категории. Они позвонят или напишут вам напрямую."
              : "Задание увидят мастера выбранной категории. Отклики бесплатны."}
        </AppText>
      </View>
    </ComposerScreen>
  );
}
