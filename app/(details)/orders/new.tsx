/**
 * /orders/new — первый вопрос конструктора: «Что нужно сделать?».
 *
 * Человек пишет задачу своими словами; каталог подсказывает категорию
 * (как поиск на старте у TaskRabbit). Категория подтверждается только тапом —
 * сама не назначается. Можно выбрать из списка. Дальше — по одному вопросу
 * на экран (src/features/task-composer/steps.ts, docs/TASK_COMPOSER.md).
 *
 * Вход с главной приносит `?draft=` (текст из поля «Что нужно сделать»).
 * Возврат после входа гостя (auth-return) приводит сюда же: если ответы
 * полные — сразу на проверку.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { SquaresFour } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  buildTaskIntentCategoryCandidates,
  buildTaskIntentSuggestions,
} from "@/features/orders/task-intent-suggestions";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import {
  COMPOSER_ROUTE,
  isComposerComplete,
  isStepValid,
  normalizeTitle,
  TITLE_MAX,
  TITLE_MIN,
} from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function TaskIntentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string; l2?: string }>();
  const composer = useComposer();
  const { values, patch } = composer;
  const nav = useStepNavigation("intent");
  const tc = useThemeColors(["ink", "on-accent", "mute"]);
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const leave = useSafeBack("/(tabs)/orders" as never);

  // Текст с главной и категория из каталога применяются один раз.
  const appliedParamsRef = useRef(false);
  useEffect(() => {
    if (appliedParamsRef.current || !composer.ready) return;
    appliedParamsRef.current = true;
    const next: Partial<typeof values> = {};
    const draft = typeof params.draft === "string" ? decodeURIComponent(params.draft) : "";
    if (draft && !values.title) next.title = normalizeTitle(draft);
    if (typeof params.l2 === "string" && params.l2 && !values.l2Id) next.l2Id = params.l2;
    if (Object.keys(next).length > 0) patch(next);
  }, [composer.ready, params.draft, params.l2, patch, values.title, values.l2Id]);

  // Возврат после входа: onboarding обязателен; полный черновик — сразу на
  // проверку, чтобы человек нажал «Опубликовать» и не проходил шаги заново.
  const [returnHandled, setReturnHandled] = useState(false);
  useEffect(() => {
    if (returnHandled || !userId || !user || !composer.ready) return;
    const store = useAuthReturnUrlStore.getState();
    if (store.peekReturnUrl() !== ORDER_CREATE_RETURN_TO) return;
    setReturnHandled(true);
    if (!user.onboarding_completed_at) {
      router.replace("/(onboarding)/client-name" as never);
      return;
    }
    store.consumeReturnUrl();
    if (isComposerComplete(values)) router.replace(COMPOSER_ROUTE.review as never);
  }, [returnHandled, userId, user, composer.ready, values, router]);

  // Подсказки категории по тексту.
  const categoriesQ = useVisibleCategories();
  const categories = categoriesQ.data ?? [];
  const debounced = useDebouncedValue(values.title, 250);
  const search = useSearchCategories(debounced, 10);
  const hits = search.data?.hits ?? [];
  const suggestions = useMemo(
    () => buildTaskIntentSuggestions(debounced, hits, categories, 4),
    [debounced, hits, categories],
  );
  const candidates = useMemo(
    () => (suggestions.length === 0 ? buildTaskIntentCategoryCandidates(hits, categories, 5) : []),
    [suggestions.length, hits, categories],
  );
  const selected = categories.find((c) => c.id === values.l2Id) ?? null;
  const SelectedIcon = selected ? getCategoryIcon(selected.icon) : null;

  const close = () => {
    if (!composer.hasContent || composer.mode.kind === "edit") {
      leave();
      return;
    }
    const discard = () => {
      useOrderDraftStore.getState().clearDraft();
      leave();
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Отмена", "Удалить черновик", "Сохранить черновик"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
          title: "Черновик задания",
        },
        (i) => {
          if (i === 1) discard();
          if (i === 2) leave();
        },
      );
    } else {
      Alert.alert("Черновик задания", undefined, [
        { text: "Удалить", style: "destructive", onPress: discard },
        { text: "Сохранить", onPress: leave },
        { text: "Отмена", style: "cancel" },
      ]);
    }
  };

  if (!composer.ready) return null;

  const trimmed = normalizeTitle(values.title);
  const titleError =
    trimmed.length > 0 && trimmed.length < TITLE_MIN ? `Минимум ${TITLE_MIN} символов` : null;

  return (
    <ComposerScreen
      step="intent"
      title="Что нужно сделать?"
      subtitle="Коротко, своими словами — как сказали бы мастеру."
      onBack={nav.fromReview ? nav.goBack : close}
      closeInsteadOfBack={!nav.fromReview}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("intent", values)}
      onPrimary={() => {
        patch({ title: trimmed });
        nav.goNext();
      }}
    >
      <ComposerField
        size="title"
        value={values.title}
        onChangeText={(t) => patch({ title: t.slice(0, TITLE_MAX) })}
        placeholder="Например, заменить смеситель"
        autoFocus={values.title.length === 0}
        returnKeyType="done"
        maxLength={TITLE_MAX}
        error={titleError}
        accessibilityLabel="Что нужно сделать"
      />

      {selected && SelectedIcon ? (
        <ChoiceGroup title="Категория">
          <ChoiceRow
            title={selected.name_ru}
            icon={<SelectedIcon size={17} weight="bold" color={tc["on-accent"]} />}
            iconAccent
            selected
            onPress={() => router.push("/orders/new/category" as never)}
            last
          />
        </ChoiceGroup>
      ) : null}

      {!selected && suggestions.length > 0 ? (
        <ChoiceGroup
          title="Похоже на"
          footer="Нажмите подходящее — так мастера точно увидят задание."
        >
          {suggestions.map((s, i) => {
            const cat = categories.find((c) => c.id === s.l2Id);
            const Icon = getCategoryIcon(cat?.icon);
            return (
              <ChoiceRow
                key={s.key}
                title={s.title}
                subtitle={s.categoryName}
                icon={<Icon size={17} weight="bold" color={tc.ink} />}
                onPress={() => patch({ title: s.title, l2Id: s.l2Id })}
                last={i === suggestions.length - 1}
              />
            );
          })}
        </ChoiceGroup>
      ) : null}

      {!selected && candidates.length > 0 ? (
        <ChoiceGroup title="Возможно, категория">
          {candidates.map((c, i) => {
            const cat = categories.find((x) => x.id === c.l2Id);
            const Icon = getCategoryIcon(cat?.icon);
            return (
              <ChoiceRow
                key={c.key}
                title={c.categoryName}
                subtitle={
                  c.matchedServiceName !== c.categoryName ? c.matchedServiceName : undefined
                }
                icon={<Icon size={17} weight="bold" color={tc.ink} />}
                onPress={() => patch({ l2Id: c.l2Id })}
                last={i === candidates.length - 1}
              />
            );
          })}
        </ChoiceGroup>
      ) : null}

      {!selected ? (
        <ChoiceGroup>
          <ChoiceRow
            title="Выбрать категорию из списка"
            icon={<SquaresFour size={17} weight="bold" color={tc.ink} />}
            navigates
            onPress={() => router.push("/orders/new/category" as never)}
            last
          />
        </ChoiceGroup>
      ) : null}
    </ComposerScreen>
  );
}
