/**
 * Typeahead-поиск услуг — паттерн Яндекс.Услуги.
 *
 * UX (точная копия скрина-эталона):
 *   1. Drag-handle сверху (декоративный, сигнал «modal-like»)
 *   2. Большой инпут (display-md, bold) + X-кнопка clear справа
 *   3. Тонкая hairline-линия под инпутом
 *   4. Заголовок секции «Подходящие услуги или специалисты» (mute, sm)
 *   5. Список услуг — каждая в одну строку, semibold
 *      Подсветка совпавшей подстроки: **жирная чёрная**, остальная — серая mute.
 *
 * Источник данных: L2 (видимые) + L3 от этих L2 — через `useSearchableServices`.
 * Фильтр клиент-сайд (~60 записей, мгновенно).
 *
 * Тап по строке → /category/[l2_id]. Если type=l3 → переход на ту же L2
 * (детальная фильтрация по l3 — отдельной задачей).
 */

import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, X } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useSearchableServices } from "@/features/categories/use-searchable-services";
import { filterServicesByQuery, highlightMatch } from "@/lib/highlight-match";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

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

  const { data: services = [], isLoading } = useSearchableServices();

  // Пустой query → показываем все услуги (browse-mode). Любой ввод → фильтр.
  const results = useMemo(
    () => filterServicesByQuery(services, query, 80),
    [services, query],
  );

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Header: back-кнопка — выйти со страницы поиска. Drag-handle убран. */}
      <View className="px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70 text-ink"
        >
          <ChevronLeft size={20} strokeWidth={1.75} color="currentColor" />
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
              <X size={22} strokeWidth={2} color="currentColor" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Hairline под инпутом. */}
      <View className="mx-5 h-px bg-hairline" />

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
            <AppText className="text-body-sm text-mute">
              Подходящие услуги или специалисты
            </AppText>
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 80 }}
          renderItem={({ item }) => {
            const segments = highlightMatch(item.name_ru, query);
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
