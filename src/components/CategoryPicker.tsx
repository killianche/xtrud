/**
 * CategoryPicker — селектор категории в стиле Klarna/Profi:
 *
 *   ┌────────────────────────────────┐
 *   │ [icon] Сантехника          ▾   │   ← compact button
 *   └────────────────────────────────┘
 *           ↓ тап
 *   ╔════════════════════════════════╗
 *   ║ Категория          ╳            ║   ← bottom-sheet
 *   ║ ┌──────────────────────────┐   ║
 *   ║ │ 🔍 Найти категорию       │   ║   ← typeahead
 *   ║ └──────────────────────────┘   ║
 *   ║ [icon] Сантехника         ✓    ║   ← список с подсветкой
 *   ║ [icon] Электрика               ║
 *   ║ ...                            ║
 *   ╚════════════════════════════════╝
 *
 * Lazyweb-вывод: для 32 категорий 2-col grid плиток — много шума и
 * визуальный перегруз. Compact selector + bottom-sheet с typeahead
 * — стандарт у Klarna/Profi.ru/Яндекс.Услуг.
 */

import { Check, ChevronDown, Search, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { filterServicesByQuery, highlightMatch } from "@/lib/highlight-match";

export interface CategoryPickerProps {
  /** id выбранной L2 категории, либо null если не выбрана. */
  value: string;
  /** Колбэк выбора. */
  onChange: (l2Id: string) => void;
  /** Disabled state (например, isBusy). */
  disabled?: boolean;
  /** Сообщение ошибки (validation). */
  error?: string;
}

export function CategoryPicker({ value, onChange, disabled, error }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useVisibleCategories();

  const selected = useMemo(
    () => categories.find((c) => c.id === value),
    [categories, value],
  );

  return (
    <View>
      {/* Compact выбор: outline кнопка с иконкой/названием или placeholder. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Выбрать категорию"
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-3 h-14 rounded-xl border px-4 active:opacity-70 ${
          error ? "border-error" : "border-hairline"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {selected ? (
          <SelectedDisplay icon={selected.icon} name={selected.name_ru} />
        ) : (
          <View className="flex-1 flex-row items-center gap-2">
            <View className="text-mute">
              <Search size={18} strokeWidth={1.75} color="currentColor" />
            </View>
            <AppText className="flex-1 text-body-md text-mute">Выберите категорию</AppText>
          </View>
        )}
        <View className="text-mute">
          <ChevronDown size={18} strokeWidth={2} color="currentColor" />
        </View>
      </Pressable>
      {error && (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          {error}
        </AppText>
      )}

      <CategorySheet
        open={open}
        onClose={() => setOpen(false)}
        selectedId={value}
        onSelect={(id) => {
          onChange(id);
          setOpen(false);
        }}
      />
    </View>
  );
}

function SelectedDisplay({ icon, name }: { icon: string; name: string }) {
  const Icon = getCategoryIcon(icon);
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <View className="text-ink">
        <Icon size={20} strokeWidth={1.5} color="currentColor" />
      </View>
      <AppText weight="semibold" className="flex-1 text-body-md text-ink" numberOfLines={1}>
        {name}
      </AppText>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Bottom-sheet с typeahead и списком категорий.
// ----------------------------------------------------------------------------

function CategorySheet({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const { data: categories = [] } = useVisibleCategories();

  const results = useMemo(
    () => filterServicesByQuery(categories, query, 100),
    [categories, query],
  );

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={() => {
        // Autofocus input при открытии — мигающий курсор сразу.
        setTimeout(() => inputRef.current?.focus(), 100);
      }}
    >
      {/* Backdrop */}
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      {/* Sheet */}
      <View
        className="absolute left-0 right-0 bottom-0 bg-canvas rounded-t-2xl"
        style={{ paddingBottom: insets.bottom, maxHeight: "85%" }}
      >
        {/* Drag handle */}
        <View className="items-center pt-2 pb-1">
          <View className="h-1 w-9 rounded-full bg-canvas-soft-2" />
        </View>

        {/* Header: title + close */}
        <View className="flex-row items-center px-5 mt-2">
          <AppText weight="semibold" className="flex-1 text-title-md text-ink">
            Категория
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-60 text-mute"
          >
            <X size={20} strokeWidth={2} color="currentColor" />
          </Pressable>
        </View>

        {/* Typeahead инпут */}
        <View className="px-5 mt-4">
          <View className="flex-row items-center gap-2 h-12 rounded-xl bg-canvas-soft px-3">
            <View className="text-mute">
              <Search size={18} strokeWidth={1.75} color="currentColor" />
            </View>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Найти категорию"
              placeholderTextColor="rgb(var(--mute) / 1)"
              className="flex-1 text-ink"
              style={{
                fontFamily: "Geist, Inter, system-ui, sans-serif",
                fontSize: 16,
                paddingVertical: 0,
              }}
            />
            {query.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Очистить"
                onPress={() => setQuery("")}
                className="h-7 w-7 items-center justify-center rounded-full active:opacity-60 text-mute"
              >
                <X size={16} strokeWidth={2} color="currentColor" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Список */}
        <View className="mt-2 pb-2" style={{ minHeight: 100 }}>
          {results.length === 0 ? (
            <View className="px-5 py-8 items-center">
              <AppText className="text-body-sm text-mute text-center">
                Ничего не нашли. Попробуйте другое слово.
              </AppText>
            </View>
          ) : (
            <View>
              {results.map((cat) => {
                const Icon = getCategoryIcon(cat.icon);
                const isSelected = selectedId === cat.id;
                const segments = highlightMatch(cat.name_ru, query);
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="button"
                    accessibilityLabel={cat.name_ru}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => onSelect(cat.id)}
                    className={`flex-row items-center gap-3 px-5 py-3 active:bg-canvas-soft-2 ${
                      isSelected ? "bg-canvas-soft" : ""
                    }`}
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-canvas-soft text-ink shrink-0">
                      <Icon size={18} strokeWidth={1.5} color="currentColor" />
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
                    {isSelected && (
                      <View className="text-ink">
                        <Check size={18} strokeWidth={2.25} color="currentColor" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
