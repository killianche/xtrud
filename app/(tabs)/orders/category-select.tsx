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

import { useRouter } from "expo-router";
import { ChevronLeft, Search, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { filterServicesByQuery, highlightMatch } from "@/lib/highlight-match";
import { useOrderDraftStore } from "@/lib/order-draft-store";

export default function CategorySelectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const setSelectedL2 = useOrderDraftStore((s) => s.setSelectedL2);
  const { data: categories = [] } = useVisibleCategories();

  const results = useMemo(
    () => filterServicesByQuery(categories, query, 100),
    [categories, query],
  );

  const handleSelect = (l2Id: string) => {
    setSelectedL2(l2Id);
    router.back();
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Header: back только */}
      <View className="flex-row items-center px-3 py-1 pb-2">
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

      {/* H1 */}
      <View className="px-5 mt-2">
        <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
          Выберите категорию
        </AppText>
      </View>

      {/* Typeahead инпут — крупный (h-16 + 20px шрифт), чтобы не было
          ощущения «инпут размером с шрифт». */}
      <View className="px-5 mt-5">
        <View className="flex-row items-center gap-3 h-16 rounded-2xl bg-canvas-soft px-4">
          <View className="text-mute">
            <Search size={22} strokeWidth={1.75} color="currentColor" />
          </View>
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Введите…"
            placeholderTextColor="rgb(var(--mute) / 1)"
            className="flex-1 text-ink"
            style={{
              fontFamily: "Geist, Inter, system-ui, sans-serif",
              fontSize: 20,
              fontWeight: "500",
              paddingVertical: 0,
            }}
          />
          {query.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить"
              onPress={() => setQuery("")}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60 text-mute"
            >
              <X size={20} strokeWidth={2} color="currentColor" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Список */}
      <ScrollView
        className="mt-4 flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {results.length === 0 ? (
          <View className="px-5 py-8 items-center">
            <AppText className="text-body-sm text-mute text-center">
              Ничего не нашли. Попробуйте другое слово.
            </AppText>
          </View>
        ) : (
          results.map((cat) => {
            const Icon = getCategoryIcon(cat.icon);
            const segments = highlightMatch(cat.name_ru, query);
            return (
              <Pressable
                key={cat.id}
                accessibilityRole="button"
                accessibilityLabel={cat.name_ru}
                onPress={() => handleSelect(cat.id)}
                className="flex-row items-center gap-3 px-5 py-3 active:bg-canvas-soft-2"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft text-ink shrink-0">
                  <Icon size={20} strokeWidth={1.5} color="currentColor" />
                </View>
                <AppText className="flex-1 text-body-md" numberOfLines={1}>
                  {segments.map((seg, idx) => (
                    <AppText
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable segment index
                      key={idx}
                      weight={seg.match ? "semibold" : "regular"}
                      className={seg.match ? "text-ink" : "text-body"}
                    >
                      {seg.text}
                    </AppText>
                  ))}
                </AppText>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
