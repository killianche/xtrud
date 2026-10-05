/**
 * /orders/new — первый вопрос конструктора: «Какая категория?».
 *
 * DECISION владельца 2026-09-07: «в самом начале должен стоять выбор
 * категории». Как у TaskRabbit: сначала категория, потом описание. Дальше —
 * по одному вопросу на экран (src/features/task-composer/steps.ts).
 *
 * DECISION владельца 2026-10-04 (скриншот): единый длинный список всех
 * подкатегорий со всех разделов и подпись «можно отметить до 3» — убраны.
 * Выбор теперь в два этапа, как в «Настройках»: сначала раздел, тап по нему
 * открывает его подкатегории отдельным экраном (`orders/new/section` —
 * владелец, 2026-10-04: свайп «назад» возвращает к разделам, а не выкидывает
 * из задания), тап по подкатегории выбирает её и сразу ведёт на следующий
 * шаг. Категория — одна (см.
 * `CategoryPickerTwoStep`, `category-picker.ts`); дополнительные категории
 * (`extraL2Ids`, 0195) очищаются при выборе здесь, но остаются в данных
 * для совместимости с публикацией и проверкой задания.
 *
 * Вход с главной приносит `?draft=` (текст из поля «Что нужно сделать») —
 * он станет названием. Возврат после входа гостя (auth-return) приводит
 * сюда же: если ответы полные — сразу на проверку.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { SearchField } from "@/components/ui";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { CategoryPickerTwoStep } from "@/features/task-composer/CategoryPickerTwoStep";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import {
  COMPOSER_ROUTE,
  COMPOSER_SECTION_ROUTE,
  isComposerComplete,
  isStepValid,
  normalizeTitle,
} from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";

export default function TaskCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    draft?: string;
    l2?: string;
    stale?: string;
    from?: string;
  }>();
  const composer = useComposer();
  const { values, patch } = composer;
  const nav = useStepNavigation("category");
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

  // Раздел — отдельный экран: системный жест «назад» с него возвращает сюда.
  // «Из проверки» передаётся дальше, чтобы выбор вернул на проверку.
  const openSection = (id: string) =>
    router.push({
      pathname: COMPOSER_SECTION_ROUTE,
      params: nav.fromReview && params.from === "review" ? { id, from: "review" } : { id },
    } as never);

  // Выбор подкатегории — сразу следующий шаг (владелец, 2026-10-04): «одно
  // действие вместо отметить + Далее». Дополнительные категории (0195)
  // очищаются — этот экран больше не предлагает их.
  const onPick = (id: string) => {
    patch({ l2Id: id, extraL2Ids: [] });
    nav.goNext();
  };

  if (!composer.ready) return null;

  return (
    <ComposerScreen
      step="category"
      title="Какая категория?"
      subtitle={
        params.stale === "1" ? "Категория изменилась в каталоге — выберите её заново." : undefined
      }
      onBack={nav.fromReview ? nav.goBack : undefined}
      onClose={nav.close}
      // Кнопки «Далее» нет: выбор подраздела сам ведёт на следующий шаг.
      hideActions
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("category", values)}
      onPrimary={nav.goNext}
    >
      <View className="mb-5 px-4">
        <SearchField
          value={query}
          onChangeText={setQuery}
          // Писать своими словами, как у Профи (№241): поиск понимает задачу.
          placeholder="Например, поменять розетку"
          showCancel={false}
          accessibilityLabel="Поиск категории"
        />
      </View>
      <CategoryPickerTwoStep
        sections={l1.data ?? []}
        categories={categories.data ?? []}
        selectedL2Id={values.l2Id}
        openSectionId={null}
        onOpenSection={openSection}
        query={query}
        onPick={onPick}
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
      />
    </ComposerScreen>
  );
}
