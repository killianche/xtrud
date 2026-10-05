/**
 * Первый экран создания задания — «Что нужно сделать?» (№242,
 * docs/COMPOSER_QUICK_START_2026-10.md). Как у Профи и YouDo: только поле и
 * клавиатура; категории появляются подсказками, когда человек пишет.
 *
 * Касание подсказки — категория выбрана, написанное стало названием, сразу
 * «Подробности». Два касания до готовых категории и названия вместо трёх, и
 * категорию не нужно искать глазами. Каталог — запасной путь: «Выбрать из
 * списка» / «Другая категория» (`orders/new/catalog`), написанное
 * сохраняется и станет названием.
 *
 * Откат — флаг `composer_start = "catalog"` в веб-админке (0228): первым
 * экраном снова каталог (`CategoryCatalogStep`).
 */

import { useRouter } from "expo-router";
import { SquaresFour } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Keyboard, Pressable, type TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CategoryL1 } from "@/features/categories/use-categories-l1";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useCategoryMatches } from "@/features/categories/use-category-matches";
import {
  useVisibleCategories,
  type VisibleCategory,
} from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
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
  const shown = matches.slice(0, MAX_SUGGESTIONS);
  const catalogLoading = categories.isLoading || l1.isLoading;
  const catalogFailed = !catalogLoading && !!(categories.error || l1.error) && !categories.data;

  // VoiceOver: подсказки появляются без касания — объявить, сколько их.
  const settled = !tooShort && !searching && !catalogLoading;
  useEffect(() => {
    if (!settled) return;
    AccessibilityInfo.announceForAccessibility(
      shown.length > 0
        ? `Подходящих категорий: ${shown.length}`
        : "Подходящей категории не нашлось",
    );
  }, [settled, shown.length]);

  const pick = (l2Id: string) => {
    patch({ l2Id, extraL2Ids: [], title: titleFromQuery(text) });
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
        // Пока ничего не написано — только тихий выход в каталог для тех,
        // кто не знает, как назвать задачу.
        <Pressable
          accessibilityRole="button"
          onPress={openCatalog}
          className="min-h-11 flex-row items-center self-start px-8 active:opacity-60"
        >
          <AppText className="text-ios-body text-accent">Выбрать из списка категорий</AppText>
        </Pressable>
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
      ) : shown.length === 0 && (searching || catalogLoading) ? (
        <View className="mx-4 overflow-hidden rounded-2xl bg-surface-card">
          {[0, 1, 2].map((i) => (
            <View key={i} className="flex-row items-center gap-3 px-4 py-3.5">
              <Skeleton width={36} height={36} className="rounded-lg" />
              <Skeleton height={17} className="flex-1 rounded" />
            </View>
          ))}
        </View>
      ) : shown.length === 0 ? (
        // Сначала объяснение, потом выход — в порядке чтения.
        <>
          <AppText className="mb-2 px-8 text-ios-subheadline text-mute">
            Не нашли подходящую категорию. Попробуйте сказать иначе или выберите из списка.
          </AppText>
          <ChoiceGroup>
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
        <ChoiceGroup title="Подходящие категории">
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
      )}
    </ComposerScreen>
  );
}
