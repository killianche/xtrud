/**
 * /orders/new/review — «Проверьте задание»: все ответы строками, каждая
 * открывает свой шаг (TaskRabbit: «изменить любой ответ в любой момент»).
 * Внизу — «Опубликовать» (или «Сохранить» при редактировании).
 *
 * Гость видит «Далее» → шаг «Ваш аккаунт» (orders/new/account): регистрация
 * и публикация одним действием (владелец, 2026-10-03). Есть аккаунт — вход
 * с возвратом к черновику.
 * Пока идёт публикация, «назад» и свайп заблокированы; после успеха экран
 * показывает результат и не даёт опубликовать второй раз.
 */

import { Redirect, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef } from "react";
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
  COMPOSER_ACCOUNT_ROUTE,
  PublishOutcomeScreen,
  PublishProgressScreen,
} from "@/features/task-composer/PublishOutcomeScreens";
import {
  COMPOSER_ROUTE,
  type ComposerStep,
  effectiveWhatsapp,
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
  const _tc = useThemeColors(["success"]);
  const close = useComposerClose();

  // Сессия редактирования живёт, пока открыт этот экран.
  useEffect(() => {
    if (mode.kind !== "edit") return;
    return () => endEdit();
  }, [mode.kind, endEdit]);

  // Фото начинают загружаться, пока человек проверяет задание: к нажатию
  // «Опубликовать» они уже на сервере (владелец, 2026-10-03: «5–10 секунд»).
  const prefetchPhotos = publish.prefetchPhotos;
  const discardPrefetched = publish.discardPrefetched;
  const photoIds = photos.map((p) => p.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: перезапуск — по составу фото (photoIds), не по ссылке массива.
  useEffect(() => {
    if (userId && composer.ready) prefetchPhotos(userId, photos);
  }, [userId, composer.ready, photoIds]);
  // Ушли, не опубликовав, — заранее загруженное удаляется.
  // biome-ignore lint/correctness/useExhaustiveDependencies: только при размонтировании.
  useEffect(() => () => discardPrefetched(), []);

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
    composer.patch({ l2Id: "", extraL2Ids: [] });
    if (mode.kind === "edit") {
      router.push({
        pathname: COMPOSER_ROUTE.category,
        params: { from: "review", stale: "1" },
      } as never);
    } else {
      router.replace({ pathname: COMPOSER_ROUTE.category, params: { stale: "1" } } as never);
    }
  }, [publish.categoryStale, composer, mode.kind, router]);

  // После успешной публикации черновик очищен и ответы пусты — редирект на
  // первый шаг здесь недопустим: сначала экран результата (владелец,
  // 2026-09-07: «после публикации сразу первый шаг, без сообщения»).
  const showOutcome = publish.outcome !== null || publish.busy;
  if (
    composer.ready &&
    mode.kind === "create" &&
    !showOutcome &&
    !isComposerComplete(values) &&
    !publish.categoryStale
  ) {
    return <Redirect href="/orders/new" />;
  }
  if (!composer.ready) return null;

  const categoryNames = [values.l2Id, ...values.extraL2Ids]
    .map((id) => categories.data?.find((c) => c.id === id)?.name_ru)
    .filter(Boolean)
    .join(", ");
  const open = (step: ComposerStep) =>
    router.push({ pathname: COMPOSER_ROUTE[step], params: { from: "review" } } as never);
  const place = values.district
    ? values.district
    : values.cityId === ALL_INGUSHETIA_CITY_ID
      ? "Вся Ингушетия"
      : getCityName(values.cityId);
  const contacts =
    values.contactMode === "phone_open"
      ? [values.contactPhone.trim(), effectiveWhatsapp(values) ? "WhatsApp" : ""]
          .filter(Boolean)
          .join(" · ")
      : "Отклики в приложении";

  const onPrimary = () => {
    if (!userId) {
      // Гость: регистрация — следующий шаг создания задания, а не отдельная
      // шторка входа (владелец, 2026-10-03).
      router.push(COMPOSER_ACCOUNT_ROUTE as never);
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

  // Нажали «Опубликовать» — экран сразу говорит, что задание уходит, а не
  // крутит кнопку (владелец, 2026-10-03). Через мгновение — результат.
  if (publish.busy && !publish.outcome && mode.kind === "create") {
    return <PublishProgressScreen />;
  }
  if (publish.outcome) return <PublishOutcomeScreen outcome={publish.outcome} />;

  return (
    <ComposerScreen
      step="review"
      title={mode.kind === "edit" ? "Проверьте изменения" : "Проверьте задание"}
      onBack={() => router.back()}
      onClose={mode.kind === "edit" ? undefined : close}
      primaryLabel={mode.kind === "edit" ? "Сохранить" : userId ? "Опубликовать" : "Далее"}
      onPrimary={onPrimary}
      busy={publish.busy}
      error={publish.error}
    >
      <ChoiceGroup title="Задание">
        <ChoiceRow
          title="Категория"
          value={categoryNames}
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
          onPress={() => open("title")}
          last
        />
      </ChoiceGroup>
      <ChoiceGroup title="Условия">
        <ChoiceRow
          title="Где"
          value={values.address.trim() ? `${place}, ${values.address.trim()}` : place}
          navigates
          onPress={() => open("where")}
        />
        <ChoiceRow
          title="Когда"
          value={values.urgency ? formatOrderTiming(values.urgency, values.preferredDate) : ""}
          navigates
          onPress={() => open("when")}
        />
        <ChoiceRow
          title="Бюджет"
          value={formatPrice(values.budgetKind ?? "negotiable", values.budgetValue)}
          navigates
          onPress={() => open("budget")}
        />
        <ChoiceRow title="Связь" value={contacts} navigates onPress={() => open("contacts")} last />
      </ChoiceGroup>
    </ComposerScreen>
  );
}
