/**
 * /orders/category-select — полноценная страница выбора категории из wizard'а.
 *
 * Раньше был bottom-sheet (CategoryPicker через Modal), но bottom-sheet
 * на web рендерится через z-index/portal и иногда даёт визуальные артефакты.
 * По запросу пользователя сделано как **отдельный route** — без backdrop'а
 * и без затемнения.
 *
 * UX:
 *   - Back-кнопка вверху
 *   - Большой typeahead-инпут (как у /search, паттерн Яндекс.Услуг)
 *   - Список всех видимых L2 категорий с soft-circle иконкой
 *   - Bold-подсветка совпавшей подстроки
 *   - Тап → setSelectedL2 в Zustand + router.back()
 *
 * Forms-state шарится через `useOrderDraftStore` — CategoryPicker на
 * /orders/new слушает store и применяет выбор в react-hook-form.
 */

import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MagnifyingGlass, Sparkle, Tag, WarningCircle, X } from "phosphor-react-native";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader, Skeleton } from "@/components/ui";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { highlightMatch } from "@/lib/highlight-match";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

const CATEGORY_SKELETON_KEYS = [
  "category-skeleton-1",
  "category-skeleton-2",
  "category-skeleton-3",
  "category-skeleton-4",
];

export default function CategorySelectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; query?: string }>();
  const draftTitle = useOrderDraftStore((s) => s.draft.title);
  const initialQuery = params.mode === "intent" ? (params.query ?? draftTitle ?? "") : "";
  const [query, setQuery] = useState(() => initialQuery.slice(0, 120));
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, 250);
  const isDebounced = debouncedQuery === normalizedQuery;
  const inputRef = useRef<TextInput>(null);
  const setSelectedL2 = useOrderDraftStore((s) => s.setSelectedL2);
  const setDraft = useOrderDraftStore((s) => s.setDraft);
  const tc = useThemeColors(["accent", "error", "mute"]);
  // Browse-режим (пустой query) — показываем все L2 категории.
  const categoriesQuery = useVisibleCategories();
  const categories = categoriesQuery.data ?? [];
  // MagnifyingGlass-режим (query >= 2) — P0-NEW умный поиск: thesaurus + FTS + trigram +
  // раскладка-fix. Возвращает L2 и L3 hits с score и source.
  const search = useSearchCategories(debouncedQuery, 20);
  // safeBack: при deeplink/refresh уходим на /orders/new (родитель wizard'а).
  const goBack = useSafeBack("/orders/new" as const);

  // Унифицированный «row»-формат для UI (L2 напрямую, L3 — через родительскую L2).
  type Row = {
    rowKey: string;
    l2_id: string; // что записываем в draft при тапе
    name_ru: string; // что показываем
    parentName: string | null; // для L3 — имя родительской L2
    icon: string | null;
    isL3: boolean;
  };

  const browseRows: Row[] = useMemo(
    () =>
      categories.map((cat) => ({
        rowKey: `l2:${cat.id}`,
        l2_id: cat.id,
        name_ru: cat.name_ru,
        parentName: null,
        icon: cat.icon,
        isL3: false,
      })),
    [categories],
  );

  const searchRows: Row[] = useMemo(() => {
    if (!search.data || !isDebounced) return [];
    // Search RPC содержит legacy synonym-ветку, которая сама по себе не
    // является publish-authority. Поэтому ручной fallback, как и intent-step,
    // fail-closed пересекает hits с текущим видимым runtime-каталогом.
    const visibleById = new Map(categories.map((category) => [category.id, category]));
    const seenL2 = new Set<string>();
    return search.data.hits.flatMap((hit) => {
      const parent = visibleById.get(hit.l2_id);
      if (!parent || seenL2.has(parent.id)) return [];
      seenL2.add(parent.id);
      return [
        {
          rowKey: `l2:${parent.id}`,
          l2_id: parent.id,
          // Legacy L3 text is never a public-catalogue authority. Search may
          // find it, but the user confirms the current visible parent L2.
          name_ru: parent.name_ru,
          parentName: null,
          icon: parent.icon,
          isL3: false,
        },
      ];
    });
  }, [categories, isDebounced, search.data]);

  const isSearching = normalizedQuery.length >= 2;
  const rows = isSearching ? searchRows : browseRows;

  const showSearchResults = () => {
    // Search is live. The keyboard action only reveals the current results;
    // choosing a category remains an explicit tap and the temporary filter
    // never replaces the saved task wording.
    inputRef.current?.blur();
  };

  const handleSelect = (l2Id: string) => {
    if (params.mode === "intent") {
      setDraft({ l2Id });
      router.replace("/orders/new/details" as never);
      return;
    }
    setSelectedL2(l2Id);
    goBack();
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Стандартный ScreenHeader (height 64, h-12 back, display-md title)
          вместо самописного h-9 w-9 + отдельной H1 ниже. Унифицирует с
          /orders/search, /profile/portfolio и т.п. */}
      <ScreenHeader title="Выберите категорию" onBack={goBack} />

      {/* Typeahead инпут — крупный (h-16 + 20px шрифт), чтобы не было
          ощущения «инпут размером с шрифт». */}
      <View className="px-5 mt-5">
        {/* min-h, не h: строка растёт вместе с текстом инпута — Dynamic Type
            больше не ограничен искусственным капом (docs/IOS_FOUNDATION.md §3.4). */}
        <View className="flex-row items-center gap-3 min-h-16 rounded-2xl bg-canvas-soft px-4 py-5">
          <View className="text-mute">
            <MagnifyingGlass size={22} weight="bold" color="currentColor" />
          </View>
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={showSearchResults}
            placeholder="Например, окна, обои или уборка"
            accessibilityLabel="Поиск категории"
            placeholderTextColor={tc.mute}
            returnKeyType="search"
            className="flex-1 text-ink"
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              fontSize: 20,
              fontWeight: "500",
              paddingVertical: 0,
            }}
          />
          {query.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              hitSlop={6}
              onPress={() => setQuery("")}
              className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
            >
              <X size={24} weight="bold" color={tc.mute} />
            </Pressable>
          )}
        </View>
      </View>

      {/* P0-NEW баннер «Возможно, вы искали ...» — когда исходный запрос дал
          0 hits и сработал раскладка-fix (rfvthf → камера). */}
      {isSearching && search.data?.wasFlipped && search.data.flippedQuery ? (
        <View className="px-5 mt-3">
          <View className="flex-row items-center gap-2 rounded-md bg-canvas-soft px-3 py-2">
            <Sparkle size={14} weight="bold" color={tc.accent} />
            <AppText className="text-caption text-body" numberOfLines={1}>
              Возможно, вы искали:{" "}
              <AppText weight="semibold" className="text-ink">
                {search.data.flippedQuery}
              </AppText>
            </AppText>
          </View>
        </View>
      ) : null}

      {/* Список */}
      <ScrollView
        className="mt-4 flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {categoriesQuery.isLoading ||
        (isSearching && (!isDebounced || search.isLoading || search.isFetching)) ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityLabel="Загружаем категории"
            className="px-5"
          >
            {CATEGORY_SKELETON_KEYS.map((key) => (
              <View key={key} className="flex-row items-center gap-3 border-b border-hairline py-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <View className="flex-1 gap-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-2/5 rounded" />
                </View>
              </View>
            ))}
          </View>
        ) : categoriesQuery.isError || (isSearching && search.isError) ? (
          <View accessibilityLiveRegion="polite" className="items-center px-5 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-error-soft">
              <WarningCircle size={25} weight="fill" color={tc.error} />
            </View>
            <AppText
              accessibilityRole="alert"
              weight="semibold"
              className="mt-4 text-center text-title-md text-ink"
            >
              Не удалось загрузить категории
            </AppText>
            <AppText className="mt-2 text-center text-body-sm text-mute">
              Попробуйте обновить список.
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Повторить поиск категории"
              onPress={() => {
                void categoriesQuery.refetch();
                if (isSearching) void search.refetch();
              }}
              className="mt-5 min-h-11 justify-center rounded-full border border-hairline px-5 active:bg-canvas-soft"
            >
              <AppText weight="semibold" className="text-body-sm text-ink">
                Повторить
              </AppText>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <View className="items-center px-5 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas-soft-2">
              <Tag size={24} weight="bold" color={tc.mute} />
            </View>
            <AppText weight="semibold" className="mt-4 text-center text-title-md text-ink">
              {isSearching ? "Ничего не нашли" : "Категории пока недоступны"}
            </AppText>
            <AppText className="mt-2 text-center text-body-sm text-mute">
              {isSearching
                ? `По запросу «${query}» нет подходящих категорий. Попробуйте другое слово.`
                : "Попробуйте открыть список ещё раз чуть позже."}
            </AppText>
          </View>
        ) : (
          rows.map((row) => {
            // Цветная Iconify-иконка (mapping в src/lib/category-color-icons.ts,
            // docs/ICONS.md). Если категория не в маппинге — fallback на
            // моно-Lucide из категорийных данных.
            const colorUrl = getCategoryColorIconUrl(row.l2_id);
            const Icon = getCategoryIcon(row.icon);
            // Highlight только когда query реально ввели (browse — без подсветки).
            const segments = isSearching ? highlightMatch(row.name_ru, query) : null;
            return (
              <Pressable
                key={row.rowKey}
                accessibilityRole="button"
                accessibilityLabel={row.name_ru}
                onPress={() => handleSelect(row.l2_id)}
                className="flex-row items-center gap-3 px-5 py-3 active:bg-canvas-soft-2"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft text-ink shrink-0">
                  {colorUrl ? (
                    <Image
                      source={{ uri: colorUrl }}
                      style={{ width: 24, height: 24 }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Icon size={20} weight="bold" color="currentColor" />
                  )}
                </View>
                <View className="flex-1">
                  <AppText className="text-body-md text-ink" numberOfLines={1}>
                    {segments
                      ? segments.map((seg, idx) => (
                          <AppText
                            // biome-ignore lint/suspicious/noArrayIndexKey: stable segment index
                            key={idx}
                            weight={seg.match ? "semibold" : "regular"}
                            className={seg.match ? "text-ink" : "text-body"}
                          >
                            {seg.text}
                          </AppText>
                        ))
                      : row.name_ru}
                  </AppText>
                  {row.isL3 && row.parentName ? (
                    <AppText className="mt-0.5 text-caption text-mute" numberOfLines={1}>
                      в категории «{row.parentName}»
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
