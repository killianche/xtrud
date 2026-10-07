/**
 * Первый экран создания задания — «Что нужно сделать?» (№242,
 * docs/COMPOSER_QUICK_START_2026-10.md). Как у Профи и YouDo: только поле и
 * клавиатура; категории появляются подсказками, когда человек пишет.
 *
 * Касание подсказки — категория выбрана, написанное стало названием, сразу
 * «Подробности». С №248 (тест друзей, видео YouDo) сверху — готовые
 * формулировки задач из словаря (`task-phrases.ts`): «Отремонтировать газовый
 * котёл» сразу задаёт и категорию, и название; ниже — категории для своего
 * названия. До ввода — «Например» с частыми задачами. Два касания до готовых категории и названия вместо трёх, и
 * категорию не нужно искать глазами. Каталог — запасной путь: «Выбрать из
 * списка» / «Другая категория» (`orders/new/catalog`), написанное
 * сохраняется и станет названием.
 *
 * С №259 (снимки владельца и YouDo, 2026-10-07) под полем — только
 * подсказки-формулировки, без списка категорий: подбор категорий по словам
 * путал («убраться в комнате» → «Кузовной ремонт»). Не подошла ни одна —
 * «Далее»: написанное станет названием, категорию ставим сами
 * (с №281 — нейросеть на сервере, 0236), на форме её нет; не уверена —
 * «Без категории», подберёт админ (№251).
 *
 * №265 (владелец, 2026-10-07): под полем ничего лишнего — ни пояснения про
 * подбор категории, ни ссылки на каталог; каталог остаётся на форме
 * (строка «Категория»).
 *
 * Откат — флаг `composer_start = "catalog"` в веб-админке (0228): первым
 * экраном снова каталог (`CategoryCatalogStep`).
 */

import { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, Keyboard, type TextInput } from "react-native";
import { AppText } from "@/components/AppText";
import type { TaskPhrase } from "@/features/categories/task-phrases";
import { useTaskPhrases } from "@/features/categories/use-task-phrases";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { ComposerField } from "./ComposerFields";
import { ChoiceGroup, ChoiceRow } from "./ComposerRows";
import { ComposerScreen } from "./ComposerScreen";
import { useComposer } from "./composer-store";
import { normalizeTitle, TITLE_MAX, TITLE_MIN, titleFromQuery } from "./steps";
import { useFocusAfterTransition } from "./use-focus-after-transition";
import { useStepNavigation } from "./use-step-navigation";

export const COMPOSER_CATALOG_ROUTE = "/orders/new/catalog";

/** Подсказки — с двух букв: одна буква совпадает почти со всем словарём. */
const MIN_QUERY = 2;

export function QuickStartStep({ subtitle }: { subtitle?: string }) {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("category");
  const categories = useVisibleCategories();
  const inputRef = useRef<TextInput>(null);
  // Клавиатура — сразу, как экран доехал: здесь одно действие — написать.
  useFocusAfterTransition(inputRef, true);

  const text = values.title;
  const tooShort = text.trim().length < MIN_QUERY;
  const visibleIds = useMemo(() => (categories.data ?? []).map((c) => c.id), [categories.data]);
  const { hits: phraseHits, examples } = useTaskPhrases(text, visibleIds);
  const canContinue = normalizeTitle(text).length >= TITLE_MIN;

  // VoiceOver: подсказки появляются без касания — объявить, сколько их.
  useEffect(() => {
    if (tooShort) return;
    AccessibilityInfo.announceForAccessibility(
      phraseHits.length > 0 ? `Подсказок: ${phraseHits.length}` : "Подсказок нет",
    );
  }, [tooShort, phraseHits.length]);

  const goNext = (l2Id: string, title: string) => {
    patch({ l2Id, extraL2Ids: [], title });
    Keyboard.dismiss();
    nav.goNext();
  };
  const pickPhrase = (p: TaskPhrase) => goNext(p.l2, p.text);
  // «Далее» без подсказки — категорию ставит нейросеть на сервере (0236),
  // не уверена — админ (владелец, 2026-10-07, №281: словарь угадывал —
  // «Поменять на столбе уличном лампочку» ушло в «Сантехнику»). Сама
  // категория — только когда человек нажал подсказку.
  const continueWithText = () => {
    if (!canContinue) return;
    goNext(UNCATEGORIZED_L2_ID, titleFromQuery(text));
  };
  // Категорий клиент не видит (владелец, 2026-10-07, №279): подсказка —
  // просто формулировка задачи, как у YouDo; категорию ставим сами.
  const phraseRow = (p: TaskPhrase, last: boolean) => (
    <ChoiceRow
      key={`${p.l2}:${p.text}`}
      title={p.text}
      selected={values.l2Id === p.l2 && values.title === p.text}
      onPress={() => pickPhrase(p)}
      last={last}
    />
  );
  const suggestions = tooShort ? examples : phraseHits;

  return (
    <ComposerScreen
      step="category"
      title="Что нужно сделать?"
      subtitle={subtitle}
      onClose={nav.close}
      // Пока ничего не написано, кнопки нет: дальше ведёт пример или ввод.
      hideActions={tooShort}
      primaryLabel="Далее"
      primaryDisabled={!canContinue}
      onPrimary={continueWithText}
    >
      <ComposerField
        ref={inputRef}
        // Обычный размер, как у поля поиска iOS: крупный (24 pt) переносил
        // пример на две строки и спорил с заголовком (снимок 2026-10-05).
        size="body"
        autoGrow
        value={text}
        // Перенос строки в названии не нужен: Return закрывает клавиатуру.
        onChangeText={(t) => patch({ title: t.replace(/\n/g, " ").slice(0, TITLE_MAX) })}
        placeholder="Например, поменять розетку"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        maxLength={TITLE_MAX}
        accessibilityLabel="Что нужно сделать"
      />

      {suggestions.length > 0 ? (
        // До ввода — примеры частых задач (как «Популярное» у YouDo, но без
        // слова «популярное»: частоту мы не измеряем); при вводе — подсказки.
        <ChoiceGroup title={tooShort ? "Например" : "Подсказки"}>
          {suggestions.map((p, i) => phraseRow(p, i === suggestions.length - 1))}
        </ChoiceGroup>
      ) : !canContinue ? (
        // 2–4 буквы без подсказок: «Далее» ещё неактивна — сказать почему.
        <AppText className="mb-4 px-8 text-ios-subheadline text-mute">
          Напишите чуть подробнее — например, «поменять розетку».
        </AppText>
      ) : null}
    </ComposerScreen>
  );
}
