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

import { ChevronLeft, Search, Sparkles, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useSearchCategories } from "@/features/categories/use-search-categories";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { highlightMatch } from "@/lib/highlight-match";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { useSafeBack } from "@/lib/use-safe-back";

export default function CategorySelectScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const setSelectedL2 = useOrderDraftStore((s) => s.setSelectedL2);
  // Browse-режим (пустой query) — показываем все L2 категории.
  const { data: categories = [] } = useVisibleCategories();
  // Search-режим (query >= 2) — P0-NEW умный поиск: thesaurus + FTS + trigram +
  // раскладка-fix. Возвращает L2 и L3 hits с score и source.
  const search = useSearchCategories(query, 20);
  // safeBack: при deeplink/refresh уходим на /orders/new (родитель wizard'а).
  const goBack = useSafeBack("/(tabs)/orders/new" as const);

  // Унифицированный «row»-формат для UI (L2 напрямую, L3 — через родительскую L2).
  type Row = {
    rowKey: string;
    l2_id: string;             // что записываем в draft при тапе
    name_ru: string;           // что показываем
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
    if (!search.data) return [];
    // Lookup L2-name для подписи L3-результатов.
    const l2NameById = new Map(categories.map((c) => [c.id, c.name_ru]));
    return search.data.hits.map((hit) => ({
      rowKey: `${hit.kind}:${hit.id}`,
      // При L3 → используем родительскую l2_id (для заказа клиент выбирает L2).
      l2_id: hit.l2_id,
      name_ru: hit.name_ru,
      parentName: hit.kind === "l3" ? l2NameById.get(hit.l2_id) ?? null : null,
      // Иконка от L2 (у L3 в БД есть icon, но он не в наших lucide-mapping'ах).
      icon: categories.find((c) => c.id === hit.l2_id)?.icon ?? null,
      isL3: hit.kind === "l3",
    }));
  }, [search.data, categories]);

  const isSearching = query.trim().length >= 2;
  const rows = isSearching ? searchRows : browseRows;

  const handleSelect = (l2Id: string) => {
    setSelectedL2(l2Id);
    goBack();
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Header: back только */}
      <View className="flex-row items-center px-3 py-1 pb-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
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

      {/* P0-NEW баннер «Возможно, вы искали ...» — когда исходный запрос дал
          0 hits и сработал раскладка-fix (rfvthf → камера). */}
      {isSearching && search.data?.wasFlipped && search.data.flippedQuery ? (
        <View className="px-5 mt-3">
          <View className="flex-row items-center gap-2 rounded-md bg-canvas-soft px-3 py-2">
            <Sparkles size={14} strokeWidth={2} color="rgb(var(--accent))" />
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
        {isSearching && search.isLoading ? (
          <View className="px-5 py-4">
            <AppText className="text-body-sm text-mute">Ищем…</AppText>
          </View>
        ) : rows.length === 0 ? (
          <View className="px-5 py-8 items-center">
            <AppText className="text-body-sm text-mute text-center">
              {isSearching
                ? `Ничего не нашли по запросу «${query}». Попробуйте другое слово.`
                : "Категорий пока нет."}
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
            const segments = isSearching
              ? highlightMatch(row.name_ru, query)
              : null;
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
                    />
                  ) : (
                    <Icon size={20} strokeWidth={1.5} color="currentColor" />
                  )}
                </View>
                <View className="flex-1">
                  <AppText className="text-body-md" numberOfLines={1}>
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
