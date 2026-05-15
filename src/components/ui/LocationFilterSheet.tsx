/**
 * LocationFilterSheet — multi-select городов И сёл напрямую (через Set с
 * префиксами `c:cityId` / `v:village`).
 *
 * Подход скопирован из Ingush-Business `components/jobs/LocationFilterSheet.tsx`.
 * Главное отличие от LocationSheet: здесь сёла находятся на ТОМ ЖЕ
 * уровне выбора что и города, а не вложены под районы. Это удобно когда
 * клиент / мастер хочет указать конкретные сёла без выбора всего района.
 *
 * **Когда использовать:**
 *   - Master service zone — мастер указывает «работаю в Магас, Назрань,
 *     Орджоникидзевская, Экажево, Гули» (микс городов и сёл).
 *   - Фильтр master-feed когда нужны конкретные сёла, а не района целиком.
 *
 * **Когда НЕ использовать:**
 *   - Один заказ — используй <LocationPicker> (иерархия район → село).
 *   - Один город — используй <CitySelector>.
 *
 * **State:** Set<"c:cityId" | "v:village">
 *
 * **Режимы UI** (как у Ingush-Business):
 *   - "cities"  — главный экран с городами + кнопка «Выбрать село»
 *   - "villages" — open-state списка сёл с поиском по букве
 *
 * **API:**
 *   <LocationFilterSheet
 *     open={visible}
 *     onClose={...}
 *     value={set}                  // ReadonlySet<LocSetItem>
 *     onApply={(next) => setSet(next)}
 *   />
 */

import { CaretRight, MagnifyingGlass, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet, Button } from "@/components/ui";
import {
  FILTER_VILLAGES,
  type LocSet,
  type LocSetItem,
  PICKER_CITIES,
} from "@/lib/location-config";
import { useThemeColors } from "@/lib/use-theme-color";

export interface LocationFilterSheetProps {
  open: boolean;
  onClose: () => void;
  value: LocSet;
  onApply: (next: ReadonlySet<LocSetItem>) => void;
  title?: string;
  subtitle?: string;
}

type Mode = "cities" | "villages";

export function LocationFilterSheet({
  open,
  onClose,
  value,
  onApply,
  title = "Локация",
  subtitle = "Выберите города и сёла",
}: LocationFilterSheetProps) {
  const tc = useThemeColors(["ink", "mute", "on-primary"]);

  const [draft, setDraft] = useState<Set<LocSetItem>>(() => new Set(value));
  const [mode, setMode] = useState<Mode>("cities");
  const [search, setSearch] = useState("");

  // Sync draft при каждом открытии (commit-on-apply pattern).
  useEffect(() => {
    if (open) {
      setDraft(new Set(value));
      setMode("cities");
      setSearch("");
    }
  }, [open, value]);

  const cityCount = useMemo(
    () => Array.from(draft).filter((x) => x.startsWith("c:")).length,
    [draft],
  );
  const villageCount = useMemo(
    () => Array.from(draft).filter((x) => x.startsWith("v:")).length,
    [draft],
  );

  function toggle(item: LocSetItem) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  function reset() {
    setDraft(new Set());
  }

  function apply() {
    onApply(draft);
    onClose();
  }

  const filteredVillages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FILTER_VILLAGES;
    return FILTER_VILLAGES.filter((v) => v.toLowerCase().includes(q));
  }, [search]);

  // --- режим "cities" ---
  if (mode === "cities") {
    return (
      <BottomSheet open={open} onClose={onClose} title={title} subtitle={subtitle} fullScreen>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* Сводка выбранного — компактные счётчики */}
          {(cityCount > 0 || villageCount > 0) ? (
            <View className="mb-4 flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas-soft px-4 py-3">
              <View className="flex-1">
                <AppText className="text-caption text-mute">Выбрано</AppText>
                <AppText weight="semibold" className="text-body-sm text-ink">
                  {cityCount > 0 ? `${cityCount} городов` : null}
                  {cityCount > 0 && villageCount > 0 ? ", " : ""}
                  {villageCount > 0 ? `${villageCount} сёл` : null}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Сбросить"
                onPress={reset}
                hitSlop={8}
                className="active:opacity-60"
              >
                <AppText weight="medium" className="text-body-sm text-link">
                  Сбросить
                </AppText>
              </Pressable>
            </View>
          ) : null}

          {/* Города */}
          <AppText weight="semibold" className="text-body-sm text-ink">
            Города
          </AppText>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {PICKER_CITIES.map((c) => {
              const key: LocSetItem = `c:${c.id}`;
              const selected = draft.has(key);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggle(key)}
                  className={`h-10 items-center justify-center rounded-pill border px-4 ${
                    selected
                      ? "border-accent bg-accent-soft"
                      : "border-hairline bg-canvas active:opacity-70"
                  }`}
                >
                  <AppText
                    weight="medium"
                    className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
                  >
                    {c.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Переход в режим выбора сёл */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Выбрать сёла"
            onPress={() => setMode("villages")}
            className="mt-6 flex-row items-center justify-between rounded-md border border-hairline bg-canvas px-4 py-3 active:opacity-70"
          >
            <View className="flex-1">
              <AppText weight="semibold" className="text-body-sm text-ink">
                Выбрать сёла
              </AppText>
              <AppText className="mt-0.5 text-caption text-mute">
                Доступно {FILTER_VILLAGES.length} сёл по всем районам
                {villageCount > 0 ? ` · выбрано ${villageCount}` : null}
              </AppText>
            </View>
            <CaretRight size={18} weight="bold" color={tc.mute} />
          </Pressable>
        </ScrollView>

        <View className="border-t border-hairline pt-4">
          <Button variant="primary" size="lg" fullWidth onPress={apply}>
            Применить
          </Button>
        </View>
      </BottomSheet>
    );
  }

  // --- режим "villages" ---
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Выбор сёл"
      subtitle="Можно выбрать несколько"
      fullScreen
    >
      {/* MagnifyingGlass input */}
      <View className="mb-3 flex-row items-center gap-2 rounded-md border border-hairline bg-canvas px-3 h-11">
        <MagnifyingGlass size={16} weight="bold" color={tc.mute} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Найти село…"
          placeholderTextColor={tc.mute}
          style={
            {
              flex: 1,
              fontSize: 15,
              color: tc.ink,
              outlineWidth: 0,
              outlineStyle: "none",
            } as object
          }
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить"
            onPress={() => setSearch("")}
            hitSlop={6}
            className="active:opacity-60"
          >
            <X size={14} weight="bold" color={tc.mute} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {filteredVillages.length === 0 ? (
          <View className="mt-8 items-center px-4">
            <AppText className="text-body-sm text-mute">
              Ничего не найдено. Попробуйте другой запрос.
            </AppText>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {filteredVillages.map((v) => {
              const key: LocSetItem = `v:${v}`;
              const selected = draft.has(key);
              return (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggle(key)}
                  className={`h-9 items-center justify-center rounded-pill border px-3 ${
                    selected
                      ? "border-accent bg-accent-soft"
                      : "border-hairline bg-canvas active:opacity-70"
                  }`}
                >
                  <AppText
                    weight="medium"
                    className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
                  >
                    {v}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View className="flex-row gap-3 border-t border-hairline pt-4">
        <View className="flex-1">
          <Button variant="secondary" size="lg" fullWidth onPress={() => setMode("cities")}>
            Назад к городам
          </Button>
        </View>
        <View className="flex-1">
          <Button variant="primary" size="lg" fullWidth onPress={apply}>
            Применить
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}
