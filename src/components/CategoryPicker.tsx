/**
 * CategoryPicker — compact selector категории.
 *
 *   ┌────────────────────────────────┐
 *   │ [icon] Сантехника          ▾   │   ← compact button
 *   └────────────────────────────────┘
 *
 * При тапе открывается ПОЛНОЦЕННАЯ страница `/orders/category-select` с
 * typeahead + списком всех L2. После выбора пользователь возвращается
 * в открывшую форму — выбранный l2 приходит через Zustand-store
 * `useOrderDraftStore.selectedL2`, который CategoryPicker слушает через
 * useEffect и применяет в react-hook-form.
 *
 * Раньше был bottom-sheet (Modal), но на web он давал визуальные
 * артефакты (z-index/backdrop). Полная страница — стабильнее и без
 * технических проблем (Lazyweb pattern: TaskRabbit/Yandex для list
 * selection в multi-step form).
 */

import { useRouter } from "expo-router";
import { CaretRight, MagnifyingGlass } from "phosphor-react-native";
import { useEffect, useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useOrderDraftStore } from "@/lib/order-draft-store";

export interface CategoryPickerProps {
  /** id выбранной L2 категории, либо пустая строка. */
  value: string;
  /** Колбэк выбора. */
  onChange: (l2Id: string) => void;
  /** Disabled state (например, isBusy). */
  disabled?: boolean;
  /** Сообщение ошибки (validation). */
  error?: string;
}

export function CategoryPicker({ value, onChange, disabled, error }: CategoryPickerProps) {
  const router = useRouter();
  const { data: categories = [] } = useVisibleCategories();

  // Слушаем store — когда пользователь выбрал категорию на отдельном
  // экране и нажал «выбрать», store.selectedL2 устанавливается → мы это
  // применяем в react-hook-form и обнуляем store, чтобы следующий цикл
  // не сработал повторно.
  const selectedFromStore = useOrderDraftStore((s) => s.selectedL2);
  const setSelectedL2 = useOrderDraftStore((s) => s.setSelectedL2);

  useEffect(() => {
    if (selectedFromStore && selectedFromStore !== value) {
      onChange(selectedFromStore);
      setSelectedL2(null);
    } else if (selectedFromStore && selectedFromStore === value) {
      // На случай переотрисовки — обнуляем флаг.
      setSelectedL2(null);
    }
  }, [selectedFromStore, value, onChange, setSelectedL2]);

  const selected = useMemo(() => categories.find((c) => c.id === value), [categories, value]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Выбрать категорию"
        disabled={disabled}
        onPress={() => router.push("/orders/category-select" as never)}
        className={`mt-2 flex-row items-center gap-3 h-14 rounded-lg bg-canvas border px-4 active:opacity-70 ${
          error ? "border-error" : "border-hairline"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {selected ? (
          <SelectedDisplay icon={selected.icon} name={selected.name_ru} />
        ) : (
          <View className="flex-1 flex-row items-center gap-3">
            <View className="text-mute">
              <MagnifyingGlass size={20} weight="bold" color="currentColor" />
            </View>
            <AppText className="flex-1 text-body-md text-mute">Выберите категорию</AppText>
          </View>
        )}
        {/* CaretRight (а не CaretDown) — visual-signal, что тап открывает
            отдельную страницу выбора, как у LocationPicker. */}
        <View className="text-mute">
          <CaretRight size={18} weight="bold" color="currentColor" />
        </View>
      </Pressable>
      {error && (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          {error}
        </AppText>
      )}
    </View>
  );
}

function SelectedDisplay({ icon, name }: { icon: string; name: string }) {
  const Icon = getCategoryIcon(icon);
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <View className="text-ink">
        <Icon size={22} weight="bold" color="currentColor" />
      </View>
      <AppText weight="semibold" className="flex-1 text-body-md text-ink" numberOfLines={1}>
        {name}
      </AppText>
    </View>
  );
}
