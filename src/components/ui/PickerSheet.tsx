/**
 * PickerSheet — full-screen single-select picker.
 *
 * Заменяет «BottomSheet с list-ом» для выбора одной опции (город, услуга,
 * сортировка). Дизайн в духе Linear / StubHub / Apple settings:
 *   - Header: большой bold title слева + (опц) reset-ссылка + close-X справа.
 *     БЕЗ тяжёлой серой круглой кнопки-стрелки «назад» — у full-screen-выбора
 *     естественный жест «закрыть», а не «вернуться на шаг». X — лёгкая иконка
 *     в mute-цвете, как у Linear status-picker и StubHub venue-picker.
 *   - Hairline divider под header
 *   - (Optional) search-input в pill-form под divider'ом, если опций много
 *   - ScrollView с опциями
 *   - Каждая опция: square 32×32 для иконки (rounded-md, bg tinted) + title +
 *     subtitle (опц). Выбранная: мягкая подсветка строки (bg-canvas-soft) +
 *     круглый filled-индикатор (bg-primary + Check в on-primary) справа.
 *   - Воздух 14-16 между опциями, без horizontal divider'ов
 *
 * ── Редизайн 2026-05-29 (#160 «галочки/выделения/стрелка некрасивые») ────────
 * Владелец: «галочки некрасивые, выделения некрасивые, стрелочка назад
 * некрасивая». Что изменено:
 *   1. Back-arrow в сером кружке → лёгкий close-X (mute) справа сверху.
 *   2. Тонкий Check в accent-цвете → круглый filled-индикатор (bg-primary +
 *      Check в on-primary) — читается дорого и однозначно, контраст 4.5:1 в
 *      обеих темах (правило §A: bg-primary всегда с on-primary).
 *   3. Подсветка выбранной строки: вместо перекраски label в text-accent —
 *      мягкий bg-canvas-soft на всю строку + semibold-label в text-ink. Один
 *      смысловой акцент (индикатор), а не два конкурирующих (цвет текста + check).
 * Референсы: Linear status-picker (X + ink-check), StubHub venue-picker
 * (row-tint + check), Apple Appearance-picker (grouped row-tint).
 *
 * **Dark theme fix 2026-05-15:** все inline `style={{ color: tc.ink }}` и
 * прочие color-styles переведены на NativeWind className (`text-ink`,
 * `bg-canvas-soft`, ...). На web inline `color: 'rgb(var(--ink))'` мог не
 * resolve'иться, и текст падал на черный default → темно-на-темном в dark
 * theme. NativeWind className → CSS-class с правильным resolution.
 *
 * Anti-patterns которых избегаем (фидбэк user 2026-05-14):
 *   - Drag-handle полоска на full-screen (там нечего «свайпать»)
 *   - Чекмарк-символ "✓" в строке текста (выглядит как опечатка)
 *   - Plain list без иконок — нет визуальной hierarchy
 *
 * Использование:
 *   <PickerSheet
 *     open={openCity}
 *     onClose={() => setOpenCity(false)}
 *     title="Город"
 *     options={CITIES.map(c => ({ id: c.id, title: c.name, icon: <MapPin/> }))}
 *     selectedId={cityId}
 *     onSelect={(id) => { setCityId(id); setOpenCity(false); }}
 *   />
 */

import { Check, MagnifyingGlass, X } from "phosphor-react-native";
import { type ReactNode, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";

/**
 * Круглый индикатор «выбрано»: bg-primary + Check в on-primary.
 * Контраст гарантирован в обеих темах (light: тёмный круг + белая галка,
 * dark: светлый круг + тёмная галка) — это и есть правило §A.
 */
function SelectedMark({ onPrimaryColor }: { onPrimaryColor: string }) {
  return (
    <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
      <Check size={13} weight="bold" color={onPrimaryColor} />
    </View>
  );
}

export interface PickerOption {
  id: string;
  title: string;
  /** Подпись справа от title (например, кол-во мастеров, регион). */
  subtitle?: string;
  /** Иконка-ReactNode (Lucide / SVG). Размер сам компонент задаст 18-20. */
  icon?: ReactNode;
  /** Цветовой токен для tinted background иконки. По умолчанию `canvas-soft`. */
  iconTint?: "canvas-soft" | "accent-soft" | "primary-soft";
}

export interface PickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** Заголовок — большой bold (text-title-lg). */
  title: string;
  /** Subtitle под title — мелкая подсказка контекста. Опц. */
  subtitle?: string;
  options: PickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Показать search-input. По умолчанию автоматически если options.length >= 8. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Reset-кнопка в header справа. Вызывается → передаёт null в onSelect. */
  resettable?: boolean;
  resetLabel?: string;
}

export function PickerSheet({
  open,
  onClose,
  title,
  subtitle,
  options,
  selectedId,
  onSelect,
  searchable,
  searchPlaceholder = "Поиск",
  resettable = false,
  resetLabel = "Сбросить",
}: PickerSheetProps) {
  const insets = useSafeAreaInsets();
  // Phosphor-иконки требуют hex color prop — берём из токенов через хук
  // (на web это CSS-var, на native — резолвленный hex). Текст / фоны / бордеры
  // — через NativeWind className.
  const muteColor = useThemeColor("mute");
  const onPrimaryColor = useThemeColor("on-primary");
  const [query, setQuery] = useState("");

  const showSearch = searchable ?? options.length >= 8;

  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) => o.title.toLowerCase().includes(q) || (o.subtitle?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query, showSearch]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        className="flex-1 bg-canvas self-center w-full"
        style={{
          paddingTop: insets.top,
          // Web: ограничиваем ширину для desktop
          maxWidth: 480,
        }}
      >
        {/* Header: большой title слева + (опц) reset + лёгкий close-X справа.
            Без серой круглой кнопки-стрелки «назад» (фидбэк #160). */}
        <View className="flex-row items-center gap-3 px-5 py-3">
          <View className="flex-1 min-w-0">
            <AppText
              weight="bold"
              className="text-display-sm tracking-tight text-ink"
              numberOfLines={1}
            >
              {title}
            </AppText>
            {subtitle ? (
              <AppText className="mt-0.5 text-caption text-mute" numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </View>

          {resettable && selectedId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={resetLabel}
              onPress={() => {
                onSelect("");
                setQuery("");
              }}
              hitSlop={8}
              className="h-9 px-3.5 rounded-pill bg-canvas-soft items-center justify-center active:opacity-60"
            >
              <AppText weight="semibold" className="text-button text-ink">
                {resetLabel}
              </AppText>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft"
          >
            <X size={22} weight="bold" color={muteColor} />
          </Pressable>
        </View>

        {/* Hairline divider под header */}
        <View className="h-px bg-hairline mx-4" />

        {/* MagnifyingGlass input (опц) */}
        {showSearch ? (
          <View className="px-4 pt-3 pb-1">
            <View className="flex-row items-center gap-2 h-10 rounded-full bg-canvas-soft px-3.5">
              <MagnifyingGlass size={16} weight="bold" color={muteColor} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={muteColor}
                className="flex-1 text-body-md text-ink"
                style={
                  {
                    // web-only: убираем синий focus outline у нативного <input>
                    outlineWidth: 0,
                    outlineStyle: "none",
                  } as object
                }
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Очистить"
                  onPress={() => setQuery("")}
                  hitSlop={6}
                  className="active:opacity-50"
                >
                  <X size={14} weight="bold" color={muteColor} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Options list */}
        <ScrollView
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <View className="px-5 pt-8 items-center">
              <AppText className="text-body-sm text-mute">Ничего не найдено</AppText>
            </View>
          ) : (
            filtered.map((opt) => {
              const isSel = opt.id === selectedId;
              const tintBgClass =
                opt.iconTint === "accent-soft" || opt.iconTint === "primary-soft"
                  ? "bg-accent-soft"
                  : "bg-canvas-soft";
              return (
                <View key={opt.id || "__empty"} className="px-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={opt.title}
                    onPress={() => onSelect(opt.id)}
                    className={`flex-row items-center gap-3 rounded-lg px-2 py-2.5 active:bg-canvas-soft ${
                      isSel ? "bg-canvas-soft" : ""
                    }`}
                  >
                    {opt.icon ? (
                      <View
                        className={`h-8 w-8 items-center justify-center rounded-md ${tintBgClass}`}
                      >
                        {opt.icon}
                      </View>
                    ) : null}

                    <View className="flex-1 min-w-0">
                      <AppText
                        weight={isSel ? "semibold" : "medium"}
                        className="text-body-md text-ink"
                        numberOfLines={1}
                      >
                        {opt.title}
                      </AppText>
                      {opt.subtitle ? (
                        <AppText className="mt-0.5 text-caption text-mute" numberOfLines={1}>
                          {opt.subtitle}
                        </AppText>
                      ) : null}
                    </View>

                    {isSel ? <SelectedMark onPrimaryColor={onPrimaryColor} /> : null}
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
