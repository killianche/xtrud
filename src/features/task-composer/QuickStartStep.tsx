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
 * Откат — флаг `composer_start = "catalog"` в веб-админке (0228): первым
 * экраном снова каталог (`CategoryCatalogStep`).
 */

import { useRouter } from "expo-router";
import { Sparkle, SquaresFour } from "phosphor-react-native";
import { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, Keyboard, Pressable, type TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TaskPhrase } from "@/features/categories/task-phrases";
import type { CategoryL1 } from "@/features/categories/use-categories-l1";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useCategoryMatches } from "@/features/categories/use-category-matches";
import { useTaskPhrases } from "@/features/categories/use-task-phrases";
import {
  useVisibleCategories,
  type VisibleCategory,
} from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { useThemeColors } from "@/lib/use-theme-color";
import { ComposerField } from "./ComposerFields";
import { ChoiceGroup, ChoiceRow } from "./ComposerRows";
import { ComposerScreen } from "./ComposerScreen";
import { useComposer } from "./composer-store";
import { isStepValid, TITLE_MAX, titleFromQuery } from "./steps";
import { useFocusAfterTransition } from "./use-focus-after-transition";
import { useStepNavigation } from "./use-step-navigation";

/** Больше пяти подсказок над клавиатурой не помещается и не помогает выбрать. */
const MAX_SUGGESTIONS = 5;
export const COMPOSER_CATALOG_ROUTE = "/orders/new/catalog";

const NO_CATEGORIES: readonly VisibleCategory[] = [];
const NO_SECTIONS: readonly CategoryL1[] = [];

export function QuickStartStep({ subtitle }: { subtitle?: string }) {
  const router = useRouter();
  const { values, patch } = useComposer();
  const nav = useStepNavigation("category");
  const tc = useThemeColors(["ink", "mute", "accent"]);
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  const inputRef = useRef<TextInput>(null);
  // Клавиатура — сразу, как экран доехал: здесь одно действие — написать.
  useFocusAfterTransition(inputRef, true);

  const text = values.title;
  const sections = l1.data ?? NO_SECTIONS;
  const { matches, searching, tooShort } = useCategoryMatches(
    text,
    categories.data ?? NO_CATEGORIES,
    sections,
  );
  // Как у YouDo (№248): сначала готовые формулировки задач — касание сразу
  // задаёт и категорию, и название; ниже — категории для своего названия.
  const visibleIds = useMemo(() => (categories.data ?? []).map((c) => c.id), [categories.data]);
  const { hits: phraseHits, examples } = useTaskPhrases(text, visibleIds);
  const shown = matches.slice(0, phraseHits.length > 0 ? 3 : MAX_SUGGESTIONS);
  const catalogLoading = categories.isLoading || l1.isLoading;
  const catalogFailed = !catalogLoading && !!(categories.error || l1.error) && !categories.data;

  // VoiceOver: подсказки появляются без касания — объявить, сколько их.
  const settled = !tooShort && !searching && !catalogLoading;
  useEffect(() => {
    if (!settled) return;
    AccessibilityInfo.announceForAccessibility(
      phraseHits.length + shown.length > 0
        ? `Подсказок: ${phraseHits.length + shown.length}`
        : "Подходящей категории не нашлось",
    );
  }, [settled, phraseHits.length, shown.length]);

  const pick = (l2Id: string) => {
    patch({ l2Id, extraL2Ids: [], title: titleFromQuery(text) });
    Keyboard.dismiss();
    nav.goNext();
  };
  const pickPhrase = (p: TaskPhrase) => {
    patch({ l2Id: p.l2, extraL2Ids: [], title: p.text });
    Keyboard.dismiss();
    nav.goNext();
  };
  const categoryById = (id: string) => categories.data?.find((c) => c.id === id);
  const phraseRow = (p: TaskPhrase, last: boolean) => {
    const c = categoryById(p.l2);
    const Icon = getCategoryIcon(c?.icon ?? null);
    return (
      <ChoiceRow
        key={`${p.l2}:${p.text}`}
        title={p.text}
        // Подпись — категория; если формулировка её повторяет, подпись не нужна.
        subtitle={c && c.name_ru.toLowerCase() !== p.text.toLowerCase() ? c.name_ru : undefined}
        icon={<Icon size={18} weight="bold" color={tc.ink} />}
        selected={values.l2Id === p.l2 && values.title === p.text}
        onPress={() => pickPhrase(p)}
        last={last}
      />
    );
  };
  const pickUncategorized = () => {
    patch({ l2Id: UNCATEGORIZED_L2_ID, extraL2Ids: [], title: titleFromQuery(text) });
    Keyboard.dismiss();
    nav.goNext();
  };
  const openCatalog = () => {
    if (text.trim()) patch({ title: titleFromQuery(text) });
    Keyboard.dismiss();
    router.push(COMPOSER_CATALOG_ROUTE as never);
  };
  const sectionName = (l1Id: string) => sections.find((s) => s.id === l1Id)?.name_ru;
  const catalogIcon = <SquaresFour size={18} weight="bold" color={tc.mute} />;

  return (
    <ComposerScreen
      step="category"
      title="Что нужно сделать?"
      subtitle={subtitle}
      onClose={nav.close}
      // «Далее» нет: дальше ведёт касание подсказки.
      hideActions
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("category", values)}
      onPrimary={nav.goNext}
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

      {tooShort ? (
        // Пока ничего не написано — примеры частых задач (как «Популярное» у
        // YouDo, но без слова «популярное»: частоту мы не измеряем) и тихий
        // выход в каталог.
        <>
          {examples.length > 0 ? (
            <ChoiceGroup title="Например">
              {examples.map((p, i) => phraseRow(p, i === examples.length - 1))}
            </ChoiceGroup>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={openCatalog}
            className="min-h-11 flex-row items-center self-start px-8 active:opacity-60"
          >
            <AppText className="text-ios-body text-accent">Выбрать из списка категорий</AppText>
          </Pressable>
        </>
      ) : catalogFailed ? (
        <ChoiceGroup footer="Не удалось загрузить категории. Проверьте связь.">
          <ChoiceRow
            title="Повторить"
            onPress={() => {
              void categories.refetch();
              void l1.refetch();
            }}
            last
          />
        </ChoiceGroup>
      ) : phraseHits.length === 0 && shown.length === 0 && (searching || catalogLoading) ? (
        <View className="mx-4 overflow-hidden rounded-2xl bg-surface-card">
          {[0, 1, 2].map((i) => (
            <View key={i} className="flex-row items-center gap-3 px-4 py-3.5">
              <Skeleton width={36} height={36} className="rounded-lg" />
              <Skeleton height={17} className="flex-1 rounded" />
            </View>
          ))}
        </View>
      ) : phraseHits.length === 0 && shown.length === 0 ? (
        // Сначала объяснение, потом выход — в порядке чтения. Не подошла ни
        // одна категория — задание всё равно публикуется: «Без категории», её
        // подберёт админ (владелец, 2026-10-06, №251).
        <>
          <AppText className="mb-2 px-8 text-ios-subheadline text-mute">
            Не нашли подходящую категорию. Опубликуйте без неё — подберём сами, или выберите из
            списка.
          </AppText>
          <ChoiceGroup>
            <ChoiceRow
              title="Опубликовать без категории"
              subtitle="Подберём категорию сами"
              icon={<Sparkle size={18} weight="bold" color={tc.accent} />}
              onPress={pickUncategorized}
            />
            <ChoiceRow
              title="Выбрать из списка"
              icon={catalogIcon}
              navigates
              onPress={openCatalog}
              last
            />
          </ChoiceGroup>
        </>
      ) : (
        <>
          {phraseHits.length > 0 ? (
            <ChoiceGroup title="Подсказки">
              {phraseHits.map((p, i) => phraseRow(p, i === phraseHits.length - 1))}
            </ChoiceGroup>
          ) : null}
          <ChoiceGroup
            title={phraseHits.length > 0 ? "Или выберите категорию" : "Подходящие категории"}
          >
            {shown.map(({ category, service }) => {
              const Icon = getCategoryIcon(category.icon);
              const section = sectionName(category.l1_id);
              return (
                <ChoiceRow
                  key={category.id}
                  title={category.name_ru}
                  // Совпавшая услуга, иначе раздел — если он не повторяет название.
                  subtitle={service ?? (section === category.name_ru ? undefined : section)}
                  icon={<Icon size={18} weight="bold" color={tc.ink} />}
                  selected={category.id === values.l2Id}
                  onPress={() => pick(category.id)}
                />
              );
            })}
            <ChoiceRow
              title="Другая категория"
              icon={catalogIcon}
              navigates
              onPress={openCatalog}
              last
            />
          </ChoiceGroup>
        </>
      )}
    </ComposerScreen>
  );
}
