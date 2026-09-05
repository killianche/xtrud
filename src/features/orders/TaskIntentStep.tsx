import { useRouter } from "expo-router";
import { Tag, WarningCircle } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, type TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SearchField, Skeleton } from "@/components/ui";
import { useRecentSearches } from "@/features/categories/use-recent-searches";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  buildTaskIntentCategoryCandidates,
  buildTaskIntentSuggestions,
  changedTaskIntentDraft,
  resolveTaskIntentQuery,
} from "@/features/orders/task-intent-suggestions";
import { getCategoryIcon } from "@/lib/category-icons";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useThemeColors } from "@/lib/use-theme-color";

export interface TaskIntentSelection {
  title: string;
  l2Id: string;
}

interface TaskIntentStepProps {
  initialQuery?: string;
  externalError?: string | null;
  isBusy?: boolean;
  onConfirm: (selection: TaskIntentSelection) => void;
}

const MIN_TITLE_LENGTH = 5;
const MAX_TITLE_LENGTH = 120;
/** Сколько категорий показываем на старте — дальше «Все категории». */
const START_CATEGORIES = 8;
const SKELETON_KEYS = [
  "intent-skeleton-1",
  "intent-skeleton-2",
  "intent-skeleton-3",
  "intent-skeleton-4",
];

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

/**
 * Первый шаг создания задания: пользователь описывает потребность обычной
 * фразой и сам подтверждает подходящую подсказку. Категория никогда не
 * назначается по вводу автоматически.
 */
export function TaskIntentStep({
  initialQuery = "",
  externalError = null,
  isBusy = false,
  onConfirm,
}: TaskIntentStepProps) {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState(() => initialQuery.slice(0, MAX_TITLE_LENGTH));
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const setDraft = useOrderDraftStore((state) => state.setDraft);
  const tc = useThemeColors(["accent", "error", "ink", "mute"]);

  const categoriesQuery = useVisibleCategories();
  const { recent, push: pushRecent, clear: clearRecent } = useRecentSearches();
  const normalizedQuery = normalizeTitle(query);
  const debouncedQuery = useDebouncedValue(normalizedQuery, 250);
  const search = useSearchCategories(debouncedQuery, 12);
  const usingBundledCatalog = categoriesQuery.source === "bundle" || search.source === "bundle";
  const isDebounced = debouncedQuery === normalizedQuery;
  const isSearching = normalizedQuery.length >= 2;
  const suggestionQuery = resolveTaskIntentQuery(
    normalizedQuery,
    search.data?.wasFlipped ?? false,
    search.data?.flippedQuery ?? null,
  );
  const resolvedTitle = normalizeTitle(suggestionQuery);

  useEffect(() => {
    setQuery(initialQuery.slice(0, MAX_TITLE_LENGTH));
  }, [initialQuery]);

  const suggestions = useMemo(
    () =>
      buildTaskIntentSuggestions(
        suggestionQuery,
        isDebounced ? (search.data?.hits ?? []) : [],
        categoriesQuery.data ?? [],
      ),
    [categoriesQuery.data, isDebounced, search.data?.hits, suggestionQuery],
  );
  const categoryCandidates = useMemo(
    () =>
      suggestions.length === 0
        ? buildTaskIntentCategoryCandidates(
            isDebounced ? (search.data?.hits ?? []) : [],
            categoriesQuery.data ?? [],
          )
        : [],
    [categoriesQuery.data, isDebounced, search.data?.hits, suggestions.length],
  );

  /** Первые категории каталога — стартовые варианты на пустом вводе. */
  const startCategories = useMemo(
    () => (categoriesQuery.data ?? []).slice(0, START_CATEGORIES),
    [categoriesQuery.data],
  );

  /** Подставить готовую формулировку в поле и показать по ней подсказки. */
  const applyQuery = (value: string) => {
    if (isBusy) return;
    setQuery(value);
    setSelectionError(null);
    setDraft(changedTaskIntentDraft(value));
    inputRef.current?.focus();
  };

  const showSearchResults = () => {
    if (isBusy) return;
    setSelectionError(null);
    // Search is already live while the user types. The iOS keyboard action
    // only reveals those results; selecting a title/category still requires
    // an explicit tap below.
    inputRef.current?.blur();
  };

  const enterManualMode = () => {
    setSelectionError(null);
    if (resolvedTitle.length < MIN_TITLE_LENGTH) {
      setSelectionError("Опишите задачу чуть подробнее — минимум 5 символов.");
      inputRef.current?.focus();
      return;
    }
    setDraft(changedTaskIntentDraft(resolvedTitle));
    router.push({
      pathname: "/orders/category-select",
      params: { mode: "intent", query: resolvedTitle },
    } as never);
  };

  const confirmSuggestion = (name: string, l2Id: string) => {
    const suggestedTitle = normalizeTitle(name);
    const title =
      suggestedTitle.length >= MIN_TITLE_LENGTH ? suggestedTitle : normalizeTitle(query);
    if (title.length < MIN_TITLE_LENGTH) {
      setSelectionError("Опишите задачу чуть подробнее — минимум 5 символов.");
      return;
    }
    setSelectionError(null);
    // В «недавние» пишем только подтверждённую формулировку, а не каждое
    // нажатие клавиши: история должна быть короткой и осмысленной.
    pushRecent(title);
    onConfirm({ title, l2Id });
  };

  const retry = () => {
    setSelectionError(null);
    void categoriesQuery.refetch();
    if (normalizedQuery.length >= 2) void search.refetch();
  };

  const hasLoadingState =
    isSearching &&
    (!isDebounced || categoriesQuery.isLoading || search.isLoading || search.isFetching);
  const hasErrorState =
    isSearching && (categoriesQuery.isError || search.isError) && !hasLoadingState;
  const hasNoResults =
    isSearching &&
    !hasLoadingState &&
    !hasErrorState &&
    suggestions.length === 0 &&
    categoryCandidates.length === 0;
  const titleError = selectionError?.startsWith("Опишите задачу") ? selectionError : undefined;

  return (
    <View className="flex-1 bg-canvas px-5 pt-6">
      <AppText weight="bold" className="text-display-md text-ink">
        Что нужно сделать?
      </AppText>

      {externalError ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="mt-4 flex-row gap-3 rounded-lg border border-error bg-error-soft px-4 py-3"
        >
          <WarningCircle size={21} weight="fill" color={tc.error} />
          <AppText weight="medium" className="min-w-0 flex-1 text-body-sm text-ink">
            {externalError}
          </AppText>
        </View>
      ) : null}

      {/* Поле — общий SearchField: лупа слева, системная очистка справа и
          правила Apple HIG. Своя версия этого поля жила здесь до 2026-09-04 и
          повторяла ошибку с `lineHeight` (текст съезжал вниз). */}
      <View className="mt-6">
        <SearchField
          ref={inputRef}
          accessibilityLabel="Что нужно сделать"
          autoFocus
          autoCapitalize="sentences"
          autoCorrect
          editable={!isBusy}
          maxLength={MAX_TITLE_LENGTH}
          invalid={!!selectionError && normalizedQuery.length < MIN_TITLE_LENGTH}
          onChangeText={(value) => {
            setQuery(value);
            setSelectionError(null);
            // A category confirms one exact intent wording. Once the wording
            // changes, invalidate that pair immediately so cancel/kill/cold
            // restore can never resume with a stale L2.
            setDraft(changedTaskIntentDraft(value));
          }}
          onSubmitEditing={showSearchResults}
          placeholder="Например, поклеить обои или убрать двор"
          value={query}
          showCancel={false}
        />
      </View>

      {titleError ? (
        <AppText
          accessibilityLiveRegion="polite"
          weight="medium"
          className="mt-2 text-body-sm text-error"
        >
          {titleError}
        </AppText>
      ) : null}

      {search.data?.wasFlipped && search.data.flippedQuery ? (
        <AppText accessibilityLiveRegion="polite" className="mt-3 text-body-sm text-mute">
          Возможно, вы искали: {search.data.flippedQuery}
        </AppText>
      ) : null}

      {usingBundledCatalog && normalizedQuery.length >= 2 ? (
        <View
          accessibilityLiveRegion="polite"
          className="mt-4 rounded-lg border border-warning bg-warning-soft px-4 py-3"
        >
          <AppText weight="semibold" className="text-body-sm text-ink">
            Используется сохранённый каталог
          </AppText>
          <AppText className="mt-1 text-body-sm text-body">
            Черновик можно заполнить без сети. Перед публикацией категория будет проверена.
          </AppText>
        </View>
      ) : null}

      {normalizedQuery.length < 2 ? (
        // Стартовый экран вместо пустоты с лупой (DECISION владельца
        // 2026-09-03: «супер плохо… пустота, неудобно»). Показываем то, что
        // реально есть: недавние формулировки этого устройства и категории
        // каталога. Тап подставляет текст в поле — подсказки появляются
        // сразу, но категория без явного подтверждения не назначается.
        <View className="mt-6">
          {recent.length > 0 ? (
            <View className="mb-7">
              <View className="flex-row items-center justify-between">
                <AppText weight="semibold" className="text-body-sm uppercase text-muted">
                  Недавние
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Очистить недавние запросы"
                  disabled={isBusy}
                  hitSlop={12}
                  onPress={clearRecent}
                  className="min-h-11 justify-center active:opacity-70"
                >
                  <AppText weight="semibold" className="text-body-md text-accent">
                    Очистить
                  </AppText>
                </Pressable>
              </View>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {recent.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityLabel={item}
                    disabled={isBusy}
                    onPress={() => applyQuery(item)}
                    className="min-h-11 justify-center rounded-pill border border-hairline bg-canvas px-4 active:bg-canvas-soft"
                  >
                    <AppText weight="medium" className="text-body-md text-ink" numberOfLines={1}>
                      {item}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Каталог доступен и без сети (встроенная копия), поэтому список
              почти всегда непустой. Заголовок без списка не показываем. */}
          {startCategories.length > 0 ? (
            <>
              <AppText weight="semibold" className="text-body-sm uppercase text-muted">
                Категории
              </AppText>
              <View className="mt-2">
                {startCategories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    accentColor={tc.accent}
                    disabled={isBusy}
                    iconKey={category.icon}
                    l2Id={category.id}
                    name={category.name_ru}
                    onPress={() => applyQuery(category.name_ru)}
                  />
                ))}
              </View>
            </>
          ) : null}
          <View className="mt-4">
            <ManualFallbackButton
              disabled={isBusy}
              label="Все категории"
              onPress={enterManualMode}
            />
          </View>
        </View>
      ) : hasLoadingState ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityLabel="Ищем подходящие варианты"
          className="mt-6"
        >
          {SKELETON_KEYS.map((key) => (
            <View key={key} className="flex-row items-center gap-3 border-b border-hairline py-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-4 w-4/5 rounded" />
                <Skeleton className="h-3 w-2/5 rounded" />
              </View>
            </View>
          ))}
        </View>
      ) : hasErrorState ? (
        <View className="mt-10 items-center px-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-error-soft">
            <WarningCircle size={25} weight="fill" color={tc.error} />
          </View>
          <AppText weight="semibold" className="mt-4 text-center text-title-md text-ink">
            Не удалось загрузить подсказки
          </AppText>
          <View className="mt-5 w-full gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={retry}
              className={`h-12 items-center justify-center rounded-md border border-hairline bg-canvas active:bg-canvas-soft ${
                isBusy ? "opacity-50" : ""
              }`}
            >
              <AppText weight="semibold" className="text-body-md text-ink">
                Повторить
              </AppText>
            </Pressable>
            <ManualFallbackButton
              disabled={isBusy}
              label="Выбрать категорию"
              onPress={enterManualMode}
            />
          </View>
        </View>
      ) : hasNoResults ? (
        // Тупика быть не должно: даже когда совпадений нет, под сообщением
        // остаются категории, с которых можно начать (DECISION 2026-09-03).
        <View className="mt-8">
          <AppText weight="bold" className="text-title-lg text-ink">
            Точной подсказки не нашли
          </AppText>
          <AppText className="mt-1 text-body-md text-body">
            Опишите задачу другими словами или выберите категорию.
          </AppText>

          {startCategories.length > 0 ? (
            <>
              <AppText weight="semibold" className="mt-7 text-body-sm uppercase text-muted">
                Категории
              </AppText>
              <View className="mt-2">
                {startCategories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    accentColor={tc.accent}
                    disabled={isBusy}
                    iconKey={category.icon}
                    l2Id={category.id}
                    name={category.name_ru}
                    onPress={() => applyQuery(category.name_ru)}
                  />
                ))}
              </View>
            </>
          ) : null}
          <View className="mt-4">
            <ManualFallbackButton
              disabled={isBusy}
              label="Все категории"
              onPress={enterManualMode}
            />
          </View>
        </View>
      ) : suggestions.length > 0 ? (
        <View className="mt-6">
          {suggestions.map((suggestion) => {
            return (
              <Pressable
                key={suggestion.key}
                accessibilityRole="button"
                accessibilityLabel={`${suggestion.title}. Категория ${suggestion.categoryName}`}
                accessibilityState={{ disabled: isBusy }}
                disabled={isBusy}
                onPress={() => confirmSuggestion(suggestion.title, suggestion.l2Id)}
                className={`min-h-16 flex-row items-center gap-3 border-b border-hairline py-3 active:bg-canvas-soft ${
                  isBusy ? "opacity-50" : ""
                }`}
              >
                <View className="h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
                  <Tag size={20} weight="fill" color={tc.accent} />
                </View>
                <View className="min-w-0 flex-1">
                  <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={2}>
                    {suggestion.title}
                  </AppText>
                  <AppText className="mt-0.5 text-body-sm text-mute" numberOfLines={1}>
                    {suggestion.categoryName}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
          <View className="mt-4">
            <ManualFallbackButton
              disabled={isBusy}
              label="Все категории"
              onPress={enterManualMode}
            />
          </View>
        </View>
      ) : (
        <View className="mt-7">
          <AppText weight="semibold" className="text-title-md text-ink">
            Уточните категорию
          </AppText>
          <AppText className="mt-1 text-body-sm text-mute">
            Мы не уверены в совпадении. Выберите наиболее подходящий вариант.
          </AppText>

          <View className="mt-4">
            {categoryCandidates.map((candidate) => (
              <Pressable
                key={candidate.key}
                accessibilityRole="button"
                accessibilityLabel={`Продолжить с категорией ${candidate.categoryName}`}
                accessibilityState={{ disabled: isBusy }}
                disabled={isBusy}
                onPress={() => confirmSuggestion(resolvedTitle, candidate.l2Id)}
                className={`min-h-16 flex-row items-center gap-3 border-b border-hairline py-3 active:bg-canvas-soft ${
                  isBusy ? "opacity-50" : ""
                }`}
              >
                <View className="h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
                  <Tag size={20} weight="fill" color={tc.accent} />
                </View>
                <View className="min-w-0 flex-1">
                  <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={2}>
                    {candidate.categoryName}
                  </AppText>
                  {candidate.matchedServiceName !== candidate.categoryName ? (
                    <AppText className="mt-0.5 text-body-sm text-mute" numberOfLines={1}>
                      Похоже на: {candidate.matchedServiceName}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>

          <View className="mt-4">
            <ManualFallbackButton
              disabled={isBusy}
              label="Все категории"
              onPress={enterManualMode}
            />
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Строка категории на стартовом экране. Иконка — цветная из каталога (тот же
 * механизм, что на экране «Все категории»), с запасным моно-вариантом: так
 * категории различаются с одного взгляда, а не выглядят одинаковыми плитками.
 */
function CategoryRow({
  accentColor,
  disabled,
  iconKey,
  name,
  onPress,
}: {
  accentColor: string;
  disabled?: boolean;
  iconKey: string | null;
  l2Id: string;
  name: string;
  onPress: () => void;
}) {
  const Icon = getCategoryIcon(iconKey);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-16 flex-row items-center gap-3 border-b border-hairline py-3 active:bg-canvas-soft ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
        {<Icon size={22} weight="bold" color={accentColor} />}
      </View>
      <AppText weight="semibold" className="min-w-0 flex-1 text-body-lg text-ink" numberOfLines={1}>
        {name}
      </AppText>
    </Pressable>
  );
}

function ManualFallbackButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-12 items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <AppText weight="semibold" className="text-body-md text-ink">
        {label}
      </AppText>
    </Pressable>
  );
}
