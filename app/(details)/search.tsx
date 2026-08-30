/**
 * Typeahead-поиск услуг — паттерн Profi.ru / Яндекс.Услуги.
 *
 * UX:
 *   1. Header с back-кнопкой + большим инпутом + X clear.
 *   2. Пустой state (input length < 2):
 *      - Если есть recent — chips «Недавние запросы» (с кнопкой «Очистить»)
 *      - Под ними browse-list всех видимых категорий (как было раньше).
 *   3. Search state (length ≥ 2):
 *      - Banner «Возможно, вы искали: <flipped>» если RPC отдал flipped result
 *      - Список результатов с bold-highlight совпадений + «Категория» badge
 *      - Tap → /category/[l2_id] + push в recent history.
 *   4. Empty state «Ничего не нашли» → безопасная ручная переформулировка.
 *
 * Сырой текст поиска не отправляется в analytics: versioned PII-safe SQL и
 * правила публичных агрегатов пока отсутствуют в runnable migrations.
 *
 * Источник данных:
 *   - Length < 2: `useSearchableServices` (плоский список L2+L3, in-memory).
 *   - Length ≥ 2: `useSearchCategories` (RPC: synonym + FTS + trigram + раскладка).
 */

import { useFocusEffect, useRouter } from "expo-router";
import { CaretLeft, ClockCounterClockwise, X } from "phosphor-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useRecentSearches } from "@/features/categories/use-recent-searches";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useSearchableServices } from "@/features/categories/use-searchable-services";
import { highlightMatch } from "@/lib/highlight-match";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

interface SearchListItem {
  id: string;
  l2_id: string;
  name_ru: string;
  type: "l2" | "l3";
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["ink", "mute", "muted-soft"]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const goBack = useSafeBack("/" as const);

  const { recent, push: pushRecent, clear: clearRecent } = useRecentSearches();
  // autofocus + сброс query на каждое открытие экрана.
  useFocusEffect(
    useCallback(() => {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }, []),
  );

  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, 200);
  const isBrowseMode = debouncedQuery.length < 2;

  // Browse-режим — плоский список всех видимых L2+L3.
  const { data: services = [], isLoading: browseLoading } = useSearchableServices();

  // Search-режим — RPC с synonym/FTS/trigram + раскладка-fix.
  const { data: searchResult, isLoading: searchLoading } = useSearchCategories(debouncedQuery, 20);

  const results: SearchListItem[] = useMemo(() => {
    if (isBrowseMode) {
      return services.slice(0, 80).map((s) => ({
        id: s.id,
        l2_id: s.l2_id,
        name_ru: s.name_ru,
        type: s.type,
      }));
    }
    if (!searchResult) return [];
    return searchResult.hits.map((h) => ({
      id: h.id,
      l2_id: h.l2_id,
      name_ru: h.name_ru,
      type: h.kind,
    }));
  }, [isBrowseMode, services, searchResult]);

  const isLoading = isBrowseMode ? browseLoading : searchLoading;
  const wasFlipped = !isBrowseMode && (searchResult?.wasFlipped ?? false);
  const flippedQuery = !isBrowseMode ? (searchResult?.flippedQuery ?? null) : null;

  const onPickQuery = (q: string) => {
    setQuery(q);
    // autofocus → пользователь видит откуда взялась подсказка
    inputRef.current?.focus();
  };

  const onResultPress = (item: SearchListItem) => {
    pushRecent(debouncedQuery);
    router.push(`/category/${item.l2_id}` as never);
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Header: back-кнопка */}
      <View className="px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-70 text-ink"
        >
          <CaretLeft size={28} weight="bold" color="currentColor" />
        </Pressable>
      </View>

      {/* Большой инпут + X clear */}
      <View className="px-5 mt-4">
        <View className="relative">
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Введите…"
            placeholderTextColor="rgb(var(--mute) / 1)"
            returnKeyType="search"
            className="text-ink"
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              fontWeight: "600",
              fontSize: 28,
              lineHeight: 36,
              paddingVertical: 4,
              paddingRight: 44,
            }}
          />
          {query.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              onPress={() => setQuery("")}
              style={{ position: "absolute", right: 0, top: 4, bottom: 4 }}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60 text-mute"
            >
              <X size={22} weight="bold" color="currentColor" />
            </Pressable>
          )}
        </View>
      </View>

      <View className="mx-5 h-px bg-hairline" />

      {/* Banner раскладки-fix */}
      {wasFlipped && flippedQuery ? (
        <View className="mx-5 mt-3 rounded-md border border-hairline bg-canvas-soft px-3 py-2">
          <AppText className="text-caption text-mute">
            Возможно, вы искали:{" "}
            <AppText weight="semibold" className="text-ink">
              {flippedQuery}
            </AppText>
          </AppText>
        </View>
      ) : null}

      {/* Контент */}
      {isBrowseMode ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Недавние запросы — chip row, only когда есть */}
          {recent.length > 0 ? (
            <View className="mt-4 px-5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <ClockCounterClockwise size={14} weight="bold" color={tc["muted-soft"]} />
                  <AppText
                    weight="mono"
                    className="text-mono-caption text-mute uppercase tracking-widest"
                  >
                    Недавние
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Очистить историю"
                  onPress={clearRecent}
                  hitSlop={8}
                  className="active:opacity-60"
                >
                  <AppText weight="medium" className="text-caption text-mute">
                    Очистить
                  </AppText>
                </Pressable>
              </View>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {recent.map((q) => (
                  <ChipQuery key={`rec-${q}`} label={q} onPress={() => onPickQuery(q)} />
                ))}
              </View>
            </View>
          ) : null}

          {/* Browse-list всех видимых L2+L3 — раньше был всегда, теперь
              как «все категории» под chip-cloud. */}
          {browseLoading ? (
            <View className="mt-6 px-5">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton row
                <View key={i} className="py-3">
                  <View className="h-5 w-2/3 rounded bg-canvas-soft-2" />
                </View>
              ))}
            </View>
          ) : results.length > 0 ? (
            <>
              <View className="mt-8 px-5">
                <AppText
                  weight="mono"
                  className="text-mono-caption text-mute uppercase tracking-widest"
                >
                  Все категории
                </AppText>
              </View>
              <View className="px-5">
                {results.map((item) => (
                  <ResultRow
                    key={`${item.type}-${item.id}`}
                    item={item}
                    highlightQuery=""
                    onPress={() => onResultPress(item)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : isLoading ? (
        <View className="px-5 mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton row
            <View key={i} className="py-3">
              <View className="h-5 w-2/3 rounded bg-canvas-soft-2" />
            </View>
          ))}
        </View>
      ) : results.length === 0 ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: 32,
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <AppText weight="bold" className="text-title-lg text-ink text-center">
            Ничего не нашли
          </AppText>
          <AppText className="mt-2 text-body-md text-mute text-center">
            Попробуйте описать задачу другими словами.
          </AppText>
        </ScrollView>
      ) : (
        <>
          <View className="px-5 mt-6">
            <AppText className="text-body-sm text-mute">Подходящие услуги или специалисты</AppText>
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item }) => {
              const highlightQuery = wasFlipped && flippedQuery ? flippedQuery : debouncedQuery;
              return (
                <ResultRow
                  item={item}
                  highlightQuery={highlightQuery}
                  onPress={() => onResultPress(item)}
                />
              );
            }}
          />
        </>
      )}
    </View>
  );
}

// ============================================================================
// ChipQuery — pill для recent / popular / empty-state suggestions.
// ============================================================================

function ChipQuery({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-9 flex-row items-center rounded-pill border border-hairline bg-canvas-soft px-3.5 active:opacity-70"
    >
      <AppText weight="medium" className="text-body-sm text-ink">
        {label}
      </AppText>
    </Pressable>
  );
}

// ============================================================================
// ResultRow — строка результата (browse + search).
// ============================================================================

function ResultRow({
  item,
  highlightQuery,
  onPress,
}: {
  item: SearchListItem;
  highlightQuery: string;
  onPress: () => void;
}) {
  const segments = highlightQuery
    ? highlightMatch(item.name_ru, highlightQuery)
    : [{ text: item.name_ru, match: false }];
  const isCategory = item.type === "l2";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name_ru}
      onPress={onPress}
      className="py-3 flex-row items-center gap-3 active:opacity-60"
    >
      <AppText className="flex-1 text-body-lg" numberOfLines={1}>
        {segments.map((seg, idx) => (
          <AppText
            // biome-ignore lint/suspicious/noArrayIndexKey: stable segment index
            key={idx}
            weight={seg.match ? "semibold" : "regular"}
            className={highlightQuery ? (seg.match ? "text-ink" : "text-mute") : "text-ink"}
          >
            {seg.text}
          </AppText>
        ))}
      </AppText>
      {isCategory ? (
        <View className="rounded-pill bg-canvas-soft-2 px-2.5 py-1">
          <AppText weight="semibold" className="text-caption text-mute">
            Категория
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
