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
 *
 * Флаг `composer_form` (0229, №249, docs/COMPOSER_ONE_FORM_2026-10.md):
 * "single" (по умолчанию) — этот же экран становится формой: простые поля
 * (название, подробности, фото, срок, бюджет, с №260 и связь) редактируются
 * прямо тут, составные (категория, адрес) — всё та же строка-переход. "steps" —
 * откат, экран ведёт себя как раньше, ничего не меняется.
 */

import { Redirect, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, ScrollView } from "react-native";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { ActiveOrdersLimitState } from "@/features/orders/ActiveOrdersLimitState";
import { formatOrderTiming, formatPrice } from "@/features/orders/order-schema";
import { taskDetailsPrompt } from "@/features/orders/task-details-prompt";
import { useOrderPublishCapacity } from "@/features/orders/use-order-publish-capacity";
import { useAppFlags } from "@/features/settings/use-app-flags";
import { BudgetFields } from "@/features/task-composer/BudgetFields";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { ContactsFields } from "@/features/task-composer/ContactsFields";
import {
  isEditDirty,
  useComposer,
  useComposerSession,
} from "@/features/task-composer/composer-store";
import { FieldFlash } from "@/features/task-composer/FieldFlash";
import { PhotoGrid } from "@/features/task-composer/PhotoGrid";
import {
  COMPOSER_ACCOUNT_ROUTE,
  PublishOutcomeScreen,
  PublishProgressScreen,
} from "@/features/task-composer/PublishOutcomeScreens";
import {
  COMPOSER_ROUTE,
  type ComposerStep,
  containsPhoneNumber,
  DESCRIPTION_MAX,
  effectiveWhatsapp,
  firstIncompleteStep,
  incompleteSteps,
  isComposerComplete,
  normalizeTitle,
  PHONE_IN_TEXT_ERROR,
  TITLE_MAX,
  TITLE_MIN,
} from "@/features/task-composer/steps";
import { useComposerClose } from "@/features/task-composer/use-composer-close";
import { usePublishTask } from "@/features/task-composer/use-publish-task";
import { WhenFields } from "@/features/task-composer/WhenFields";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { hapticWarning } from "@/lib/haptics";
import { ALL_INGUSHETIA_CITY_ID, formatOrderPlace, getCityName } from "@/lib/location-config";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useThemeColors } from "@/lib/use-theme-color";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

/** Короткие имена разделов для строки «Осталось указать: …» (№290). */
const STEP_SHORT: Record<ComposerStep, string> = {
  category: "категорию",
  title: "название",
  where: "адрес",
  when: "срок",
  budget: "бюджет",
  contacts: "связь",
  review: "",
};

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
  // Форма одним экраном (вариант B, №249) или прежний пошаговый вид — откат
  // переключателем в админке, без новой сборки.
  const formFlag = useAppFlags().composerForm;
  // Нажали «Опубликовать» с незаполненной формой: показываем ошибки, а не
  // блокируем кнопку заранее (на шести ответах постоянно неактивная кнопка
  // не объясняет, чего не хватает).
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Какой раздел подсветить и номер вспышки: каждое нажатие — новая (№290).
  const [flash, setFlash] = useState<{ step: ComposerStep | null; n: number }>({
    step: null,
    n: 0,
  });

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
  // Положение разделов формы — чтобы прокрутить к первому незаполненному
  // при «Опубликовать» (№249). Хуки — до ранних return.
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<ComposerStep, number>>>({});
  const reducedMotion = useReducedMotion();
  const at = (step: ComposerStep) => (e: LayoutChangeEvent) => {
    sectionY.current[step] = e.nativeEvent.layout.y;
  };
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
  // Форма одним экраном (№249): сюда приходят сразу после выбора категории,
  // остальное ещё не заполнено — это не «пустой черновик», это и есть
  // форма. Редирект на первый шаг — только если категории вообще нет
  // (холодный вход без неё, как и раньше).
  const entryIncomplete = formFlag === "single" ? !values.l2Id : !isComposerComplete(values);
  if (
    composer.ready &&
    mode.kind === "create" &&
    !showOutcome &&
    entryIncomplete &&
    !publish.categoryStale
  ) {
    return <Redirect href="/orders/new" />;
  }
  if (!composer.ready) return null;

  // «Без категории» скрыта из каталога — подпись своя (№251).
  const categoryNames =
    values.l2Id === UNCATEGORIZED_L2_ID
      ? "Подберём сами"
      : [values.l2Id, ...values.extraL2Ids]
          .map((id) => categories.data?.find((c) => c.id === id)?.name_ru)
          .filter(Boolean)
          .join(", ");
  const open = (step: ComposerStep) =>
    router.push({ pathname: COMPOSER_ROUTE[step], params: { from: "review" } } as never);
  // Место не выбрано — пусто (форма покажет «Выбрать»), а не «Ингушетия»
  // по умолчанию названия города.
  const place = values.district
    ? formatOrderPlace(null, values.district, values.village)
    : values.cityId === ALL_INGUSHETIA_CITY_ID
      ? "Вся Ингушетия"
      : values.cityId
        ? getCityName(values.cityId)
        : "";
  const contacts =
    values.contactMode === "phone_open"
      ? [values.contactPhone.trim(), effectiveWhatsapp(values) ? "WhatsApp" : ""]
          .filter(Boolean)
          .join(" · ")
      : "Предложения в приложении";

  // Форма одним экраном: раньше первой нехватки не видно было, пока её не
  // открыли — теперь нажатие «Опубликовать» с пустым разделом сразу
  // показывает, чего не хватает (docs/COMPOSER_ONE_FORM_2026-10.md §4).
  const missingStep =
    formFlag === "single" && submitAttempted && !isComposerComplete(values)
      ? firstIncompleteStep(values)
      : null;

  const onPrimary = () => {
    if (formFlag === "single" && !isComposerComplete(values)) {
      setSubmitAttempted(true);
      hapticWarning();
      // К первому незаполненному — а не только текст над кнопкой.
      const first = firstIncompleteStep(values);
      setFlash((f) => ({ step: first, n: f.n + 1 }));
      const y = first ? sectionY.current[first] : undefined;
      if (y !== undefined)
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: !reducedMotion });
      return;
    }
    // Гость — на регистрацию только с заполненной формой: иначе после входа
    // возврат на начало, и пропуск всплыл бы уже после регистрации.
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

  // Откат (composer_form = "steps"): прежний экран проверки без изменений.
  if (formFlag === "steps") {
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
            title="Адрес"
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
          <ChoiceRow
            title="Связь"
            value={contacts}
            navigates
            onPress={() => open("contacts")}
            last
          />
        </ChoiceGroup>
      </ComposerScreen>
    );
  }

  // Вариант B (№249): этот же экран — форма. Простые поля редактируются
  // прямо здесь (перенос JSX из title.tsx/when.tsx/budget.tsx без изменения
  // пропсов), составные — строка-переход тем же механизмом `from=review`.
  const remaining = incompleteSteps(values).map((st) => STEP_SHORT[st]);
  const flashFor = (step: ComposerStep) => (flash.step === step ? flash.n : 0);
  const titleTrimmed = normalizeTitle(values.title);
  const titleError =
    titleTrimmed.length === 0
      ? "Укажите название"
      : titleTrimmed.length < TITLE_MIN
        ? `Минимум ${TITLE_MIN} символов`
        : containsPhoneNumber(titleTrimmed)
          ? PHONE_IN_TEXT_ERROR
          : null;

  return (
    <ComposerScreen
      step="review"
      title={mode.kind === "edit" ? "Изменение задания" : "Новое задание"}
      onBack={() => router.back()}
      onClose={mode.kind === "edit" ? undefined : close}
      primaryLabel={mode.kind === "edit" ? "Сохранить" : userId ? "Опубликовать" : "Далее"}
      onPrimary={onPrimary}
      busy={publish.busy}
      // Ошибка нехватки — у самого раздела (подсветка + текст под ним), над
      // кнопкой её не повторяем. Над кнопкой — спокойная строка «что
      // осталось», видна сразу, а не после нажатия (№290).
      error={publish.error}
      footnote={remaining.length > 0 ? `Осталось указать: ${remaining.join(", ")}` : null}
      primaryInactive={remaining.length > 0}
      primaryHint={remaining.length > 0 ? `Осталось указать: ${remaining.join(", ")}` : undefined}
      scrollRef={scrollRef}
    >
      <FieldFlash onLayout={at("title")} trigger={flashFor("title")}>
        <ComposerField
          label="Название задания"
          size="title"
          // Название из подсказки бывает длинным — поле растёт, а не режет текст.
          autoGrow
          value={values.title}
          onChangeText={(t) => composer.patch({ title: t.replace(/\n/g, " ").slice(0, TITLE_MAX) })}
          placeholder="Например, заменить смеситель на кухне"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          maxLength={TITLE_MAX}
          error={titleError}
          forceError={submitAttempted}
          accessibilityLabel="Название задания"
        />
      </FieldFlash>
      <FieldFlash onLayout={at("category")} trigger={flashFor("category")}>
        {/* Категорий клиент не видит вовсе (владелец, 2026-10-07, №279): её
            ставит словарь или нейросеть на сервере, сомнительное — админ.
            Строка остаётся только если категории нет совсем (старый
            черновик) — иначе опубликовать нельзя. */}
        {values.l2Id ? null : (
          <ChoiceGroup>
            <ChoiceRow
              title="Категория"
              value={categoryNames}
              navigates
              onPress={() => open("category")}
              last
            />
          </ChoiceGroup>
        )}
        {missingStep === "category" ? (
          <AppText
            accessibilityRole="alert"
            className="-mt-5 mb-5 px-8 text-ios-footnote text-error"
          >
            Выберите категорию
          </AppText>
        ) : null}
      </FieldFlash>
      <ComposerField
        label="Подробности · по желанию"
        multiline
        value={values.description}
        onChangeText={(t) => composer.patch({ description: t.slice(0, DESCRIPTION_MAX) })}
        placeholder={taskDetailsPrompt(values.l2Id)}
        hint={
          values.description.length > DESCRIPTION_MAX - 200
            ? `${values.description.length} из ${DESCRIPTION_MAX}`
            : undefined
        }
        error={containsPhoneNumber(values.description) ? PHONE_IN_TEXT_ERROR : null}
        forceError
        accessibilityLabel="Описание задания"
      />
      <PhotoGrid photos={photos} onChange={composer.setPhotos} />
      <FieldFlash onLayout={at("where")} trigger={flashFor("where")}>
        <ChoiceGroup>
          <ChoiceRow
            // «Адрес», а не «Где» (владелец, 2026-10-07, №260): подпись строки —
            // что указать, как у Авито и YouDo.
            title="Адрес"
            // Пусто — «Выбрать», а не голая строка: видно, что здесь ждут ответа.
            value={
              (values.address.trim() ? `${place}, ${values.address.trim()}` : place) || "Выбрать"
            }
            navigates
            onPress={() => open("where")}
            last
          />
        </ChoiceGroup>
        {missingStep === "where" ? (
          <AppText
            accessibilityRole="alert"
            className="-mt-5 mb-5 px-8 text-ios-footnote text-error"
          >
            Укажите адрес
          </AppText>
        ) : null}
      </FieldFlash>
      <FieldFlash onLayout={at("when")} trigger={flashFor("when")}>
        <WhenFields
          values={values}
          patch={composer.patch}
          showMissingError={missingStep === "when"}
          showLabel
        />
      </FieldFlash>
      <FieldFlash onLayout={at("budget")} trigger={flashFor("budget")}>
        <BudgetFields
          values={values}
          patch={composer.patch}
          showMissingError={missingStep === "budget"}
          showLabel
        />
      </FieldFlash>
      <FieldFlash onLayout={at("contacts")} trigger={flashFor("contacts")}>
        {/* Два способа — сразу на форме, без перехода (владелец, №260). */}
        <ContactsFields title="Связь" />
        {missingStep === "contacts" ? (
          <AppText
            accessibilityRole="alert"
            className="-mt-5 mb-5 px-8 text-ios-footnote text-error"
          >
            Укажите, как с вами связаться
          </AppText>
        ) : null}
      </FieldFlash>
    </ComposerScreen>
  );
}
