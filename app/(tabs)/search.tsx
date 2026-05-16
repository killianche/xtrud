/**
 * Typeahead-поиск услуг — паттерн Яндекс.Услуги.
 *
 * UX:
 *   1. Большой инпут (display-md, bold) + X-кнопка clear справа
 *   2. Тонкая hairline-линия под инпутом
 *   3. Banner «Возможно, вы искали: <flipped>» если RPC отдал результат после раскладки-fix
 *   4. Заголовок секции «Подходящие услуги или специалисты» (mute, sm)
 *   5. Список услуг — каждая в одну строку, semibold
 *      Подсветка совпавшей подстроки: **жирная чёрная**, остальная — серая mute.
 *
 * **Источник данных (2026-05-16):**
 *   - Запрос пустой → `useSearchableServices` (browse-mode, плоский список L2+L3, ~60 записей).
 *   - Запрос ≥2 символов → `useSearchCategories` (RPC `search_categories`):
 *       synonym (`category_terms`) + FTS (`russian` tsvector) + trigram (`pg_trgm`)
 *       + раскладка-fix («jhjnf» → «работа»).
 *   Раньше использовался ТОЛЬКО client-side ILIKE — synonym/FTS/раскладка-fix
 *   были написаны в БД, но не вызывались из UI. Симптом: поиск «обои» давал 0,
 *   хотя synonym `обои → finishing` лежал в БД. См.
 *   `.claude/rules/connect-the-dots.md` — правило заведено по этому случаю.
 *
 * Тап по строке → /category/[l2_id]. Если type=l3 → переход на ту же L2
 * (детальная фильтрация по l3 — отдельной задачей).
 */

import { useFocusEffect, useRouter } from "expo-router";
import { CaretLeft, X } from "phosphor-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useSearchableServices } from "@/features/categories/use-searchable-services";
import { highlightMatch } from "@/lib/highlight-match";
import { useSafeBack } from "@/lib/use-safe-back";

interface SearchListItem {
  id: string;
  l2_id: string;
  name_ru: string;
  type: "l2" | "l3";
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  // safeBack: deeplink/refresh → home (поиск открывается всегда из home).
  const goBack = useSafeBack("/" as const);

  // Гарантированный autofocus + сброс query при каждом открытии экрана.
  // RNW autoFocus иногда не срабатывает после navigation/cache — ручной
  // .focus() через useFocusEffect перекрывает все edge-cases.
  useFocusEffect(
    useCallback(() => {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }, []),
  );

  const trimmedQuery = query.trim();
  const isBrowseMode = trimmedQuery.length < 2;

  // Browse-режим (пустой query / 1 символ) — плоский список всех видимых L2+L3.
  // Не использует RPC: server-roundtrip на каждое нажатие тяжелее чем in-memory
  // фильтр по 60 записям.
  const { data: services = [], isLoading: browseLoading } = useSearchableServices();

  // Search-режим (≥2 символов) — RPC с synonym/FTS/trigram + раскладка-fix.
  // RPC возвращает score-ranked hits; client-side фильтр не нужен.
  const { data: searchResult, isLoading: searchLoading } = useSearchCategories(trimmedQuery, 20);

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

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Header: back-кнопка — выйти со страницы поиска. Drag-handle убран. */}
      <View className="px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70 text-ink"
        >
          <CaretLeft size={20} weight="bold" color="currentColor" />
        </Pressable>
      </View>

      {/* Большой инпут + X clear.
          NOTE: X-кнопка позиционируется absolute справа (а не как flex-sibling)
          — в react-native-web TextInput с flex-1 растягивается за пределы
          контейнера, не оставляя места sibling'у. */}
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
              fontFamily: "Geist, Inter, system-ui, sans-serif",
              fontWeight: "600",
              fontSize: 28,
              lineHeight: 36,
              paddingVertical: 4,
              paddingRight: 44, // место под X-кнопку справа
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

      {/* Hairline под инпутом. */}
      <View className="mx-5 h-px bg-hairline" />

      {/* Banner «Возможно, вы искали ...» — Google-pattern. Появляется когда
          исходный query 0 хитов, а RPC нашёл flipped (например, набрал «jhjnf»
          в латинской раскладке — реально хотел «работа»). */}
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

      {/* Список услуг. Пустой query → browse (все категории), есть query →
          фильтр с bold-подсветкой совпадений. */}
      {isLoading ? (
        <View className="px-5 mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based
            <View key={i} className="py-3">
              <View className="h-5 w-2/3 rounded bg-canvas-soft-2" />
            </View>
          ))}
        </View>
      ) : results.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText weight="bold" className="text-title-lg text-ink text-center">
            Ничего не нашли
          </AppText>
          <AppText className="mt-2 text-body-md text-mute text-center">
            Попробуйте другое слово — «сантехник», «плиточник», «электрик».
          </AppText>
        </View>
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
              // home-indicator safe-area + воздух (24). Без +bottom список
              // подрезает последние строки на iPhone X+.
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item }) => {
              // Для wasFlipped подсвечиваем flippedQuery (по нему искали), а не
              // оригинальный набор-в-неправильной-раскладке.
              const highlightQuery = wasFlipped && flippedQuery ? flippedQuery : query;
              const segments = highlightMatch(item.name_ru, highlightQuery);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.name_ru}
                  onPress={() => router.push(`/category/${item.l2_id}` as never)}
                  className="py-3 active:opacity-60"
                >
                  <AppText className="text-body-lg" numberOfLines={1}>
                    {segments.map((seg, idx) => (
                      <AppText
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable segment index
                        key={idx}
                        weight={seg.match ? "semibold" : "regular"}
                        className={seg.match ? "text-ink" : "text-mute"}
                      >
                        {seg.text}
                      </AppText>
                    ))}
                  </AppText>
                </Pressable>
              );
            }}
          />
        </>
      )}
    </View>
  );
}
