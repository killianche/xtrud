/**
 * /orders/new — первый вопрос конструктора: «Какая категория?».
 *
 * DECISION владельца 2026-09-07: «в самом начале должен стоять выбор
 * категории». Как у TaskRabbit: сначала категория, потом описание. Список —
 * inset grouped по разделам каталога с поиском; выбранная строка — галочка.
 * Дальше — по одному вопросу на экран (src/features/task-composer/steps.ts).
 *
 * Вход с главной приносит `?draft=` (текст из поля «Что нужно сделать») —
 * он станет названием. Возврат после входа гостя (auth-return) приводит
 * сюда же: если ответы полные — сразу на проверку.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { PickerSections, type PickerSheetSection, SearchField } from "@/components/ui";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import {
  COMPOSER_ROUTE,
  isComposerComplete,
  isStepValid,
  normalizeTitle,
} from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

export default function TaskCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string; l2?: string; stale?: string }>();
  const composer = useComposer();
  const { values, patch } = composer;
  const nav = useStepNavigation("category");
  const tc = useThemeColors(["ink"]);
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const [query, setQuery] = useState("");

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
  // проверку, чтобы человек нажал «Опубликовать», а не проходил шаги заново.
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

  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  // Тот же список, что в шторках выбора категории (PickerSections): плитки
  // иконок, галочка, поиск. Разделы каталога — группы; без «Весь раздел»:
  // заданию нужна конкретная категория.
  const sections = useMemo<PickerSheetSection[]>(() => {
    const list: PickerSheetSection[] = [];
    for (const section of l1.data ?? []) {
      const inSection = (categories.data ?? []).filter((c) => c.l1_id === section.id);
      if (inSection.length === 0) continue;
      list.push({
        id: section.id,
        title: section.name_ru,
        options: inSection.map((c) => {
          const Icon = getCategoryIcon(c.icon);
          return {
            id: c.id,
            title: c.name_ru,
            icon: <Icon size={17} weight="bold" color={tc.ink} />,
          };
        }),
      });
    }
    return list;
  }, [categories.data, l1.data, tc.ink]);

  if (!composer.ready) return null;

  return (
    <ComposerScreen
      step="category"
      title="Какая категория?"
      subtitle={
        params.stale === "1"
          ? "Категория изменилась в каталоге — выберите её заново."
          : "Задание увидят мастера этой категории."
      }
      onBack={nav.fromReview ? nav.goBack : undefined}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("category", values)}
      onPrimary={nav.goNext}
    >
      <View className="mb-5 px-4">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Например, электрик или уборка"
          showCancel={false}
          accessibilityLabel="Поиск категории"
        />
      </View>
      <PickerSections
        sections={sections}
        selectedId={values.l2Id ?? null}
        onSelect={(id) => {
          hapticSelection();
          patch({ l2Id: id });
        }}
        query={query}
        loading={categories.isLoading || l1.isLoading}
        errorMessage={
          categories.error || l1.error
            ? "Не удалось загрузить категории. Проверьте связь."
            : undefined
        }
        onRetry={() => {
          void categories.refetch();
          void l1.refetch();
        }}
        emptyText="Ничего не нашли. Попробуйте другое слово."
      />
    </ComposerScreen>
  );
}
