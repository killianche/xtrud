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
 * DECISION владельца 2026-10-05 (№242): первым экраном — «Что нужно
 * сделать?» (`QuickStartStep`): поле, категории подсказками при вводе, как у
 * Профи и YouDo. Каталог (`CategoryCatalogStep`) — при откате флагом
 * `composer_start = "catalog"` (0228), с проверки, при правке и устаревшей
 * категории; из подсказок — `orders/new/catalog`.
 *
 * Вход с главной приносит `?draft=` (текст из поля «Что нужно сделать») —
 * он станет названием. Возврат после входа гостя (auth-return) приводит
 * сюда же: если ответы полные — сразу на проверку.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useAppFlagsQuery } from "@/features/settings/use-app-flags";
import { CategoryCatalogStep } from "@/features/task-composer/CategoryCatalogStep";
import { useComposer } from "@/features/task-composer/composer-store";
import { QuickStartStep } from "@/features/task-composer/QuickStartStep";
import { COMPOSER_ROUTE, isComposerComplete, normalizeTitle } from "@/features/task-composer/steps";
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

  const flags = useAppFlagsQuery();

  if (!composer.ready) return null;

  const subtitle =
    params.stale === "1" ? "Категория изменилась в каталоге — выберите её заново." : undefined;
  // Со слов — только для нового задания: с проверки, при правке и при
  // устаревшей категории меняют именно категорию (№242).
  // Флаг ещё не пришёл — сразу новый путь (он же по умолчанию), без пустого
  // экрана в ожидании сети (design-quality §1.2); "catalog" — только явный откат.
  const quick =
    (flags.data?.composerStart ?? "quick") === "quick" && !nav.fromReview && params.stale !== "1";

  if (quick) return <QuickStartStep />;
  return (
    <CategoryCatalogStep subtitle={subtitle} onBack={nav.fromReview ? nav.goBack : undefined} />
  );
}
