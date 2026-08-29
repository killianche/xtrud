import { useRouter } from "expo-router";
import { MagnifyingGlass, Tag, WarningCircle, X } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import {
  buildTaskIntentCategoryCandidates,
  buildTaskIntentSuggestions,
  changedTaskIntentDraft,
  resolveTaskIntentQuery,
} from "@/features/orders/task-intent-suggestions";
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

      <View
        className={`mt-6 min-h-14 flex-row items-center gap-3 rounded-lg border bg-canvas px-4 ${
          selectionError && normalizedQuery.length < MIN_TITLE_LENGTH
            ? "border-error"
            : "border-hairline"
        }`}
      >
        <MagnifyingGlass size={22} weight="bold" color={tc.mute} />
        <TextInput
          ref={inputRef}
          accessibilityLabel="Что нужно сделать"
          autoFocus
          autoCapitalize="sentences"
          autoCorrect
          editable={!isBusy}
          maxLength={MAX_TITLE_LENGTH}
          maxFontSizeMultiplier={1.3}
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
          placeholderTextColor={tc.mute}
          returnKeyType="search"
          value={query}
          className="min-h-12 flex-1 py-3 text-body-md text-ink"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить описание задачи"
            disabled={isBusy}
            hitSlop={6}
            onPress={() => {
              setQuery("");
              setSelectionError(null);
              setDraft(changedTaskIntentDraft(""));
              inputRef.current?.focus();
            }}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-canvas-soft-2"
          >
            <X size={20} weight="bold" color={tc.mute} />
          </Pressable>
        ) : null}
      </View>

      {titleError ? (
        <AppText
          accessibilityLiveRegion="polite"
          weight="medium"
          className="mt-2 text-caption text-error"
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
          <AppText className="mt-1 text-caption text-body">
            Черновик можно заполнить без сети. Перед публикацией категория будет проверена.
          </AppText>
        </View>
      ) : null}

      {normalizedQuery.length < 2 ? (
        <View className="mt-10 items-center px-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas-soft-2">
            <MagnifyingGlass size={24} weight="bold" color={tc.mute} />
          </View>
          <AppText weight="semibold" className="mt-4 text-center text-title-md text-ink">
            Начните с действия
          </AppText>
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
        <View className="mt-10 items-center px-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas-soft-2">
            <Tag size={24} weight="bold" color={tc.mute} />
          </View>
          <AppText weight="semibold" className="mt-4 text-center text-title-md text-ink">
            Точной подсказки не нашли
          </AppText>
          <View className="mt-5 w-full">
            <ManualFallbackButton
              disabled={isBusy}
              label="Выбрать категорию"
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
                  <AppText className="mt-0.5 text-caption text-mute" numberOfLines={1}>
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
                    <AppText className="mt-0.5 text-caption text-mute" numberOfLines={1}>
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
