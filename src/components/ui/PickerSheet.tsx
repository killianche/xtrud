/**
 * PickerSheet — full-screen single-select picker.
 *
 * Заменяет «BottomSheet с list-ом» для выбора одной опции (город, услуга,
 * сортировка). Дизайн в духе Vercel/Linear/Poshmark/Fever:
 *   - Header: round back-button (36×36 bg-canvas-soft) + большой bold title +
 *     опциональная reset-ссылка справа (для фильтров)
 *   - Hairline divider под header
 *   - (Optional) search-input в pill-form под divider'ом, если опций много
 *   - ScrollView с опциями
 *   - Каждая опция: square 40×40 для иконки (rounded-md, bg tinted) +
 *     title (semibold для selected) + subtitle (опц) + Check 20px в accent справа
 *   - Voздух 14-16 между опциями, без horizontal divider'ов
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

import { Check, ChevronLeft, Search, X } from "lucide-react-native";
import { type ReactNode, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

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
  const tc = useThemeColors([
    "canvas",
    "canvas-soft",
    "ink",
    "body",
    "mute",
    "hairline",
    "accent",
    "accent-soft",
  ]);
  const [query, setQuery] = useState("");

  const showSearch = searchable ?? options.length >= 8;

  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.title.toLowerCase().includes(q) ||
        (o.subtitle?.toLowerCase().includes(q) ?? false),
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
        className="bg-canvas"
        style={{
          flex: 1,
          paddingTop: insets.top,
          // Web: ограничиваем ширину для desktop
          maxWidth: 480,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {/* Header: back-button + title + (optional reset) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => ({
              // Размер поднят 36→44 (тач-таргет минимум по CROSS_PLATFORM_RULES),
              // chevron 20→24 — пользователь жаловался на мелкую back-стрелку
              // (2026-05-14). bg-canvas-soft даёт мягкий контейнер, не «голая»
              // иконка.
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tc["canvas-soft"],
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <ChevronLeft size={24} strokeWidth={2.25} color={tc.ink} />
          </Pressable>

          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <AppText
              weight="bold"
              style={{ color: tc.ink, fontSize: 22, lineHeight: 28 }}
              numberOfLines={1}
            >
              {title}
            </AppText>
            {subtitle ? (
              <AppText
                style={{ color: tc.mute, fontSize: 13, lineHeight: 18, marginTop: 2 }}
                numberOfLines={1}
              >
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
              style={({ pressed }) => ({
                // Pill-кнопка вместо тонкой ссылки — пользователь жаловался
                // что reset «мелкий, плохо заметный» (2026-05-14). Pill +
                // accent-soft фон + accent текст semibold — явный CTA уровень,
                // как в Airbnb/Booking pickers.
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: tc["accent-soft"],
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <AppText
                weight="semibold"
                style={{ color: tc.accent, fontSize: 15, lineHeight: 20 }}
              >
                {resetLabel}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {/* Hairline divider под header */}
        <View
          style={{
            height: 1,
            backgroundColor: tc.hairline,
            marginHorizontal: 16,
          }}
        />

        {/* Search input (опц) */}
        {showSearch ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 4,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 14,
                height: 40,
                borderRadius: 20,
                backgroundColor: tc["canvas-soft"],
              }}
            >
              <Search size={16} strokeWidth={1.75} color={tc.mute} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={tc.mute}
                style={
                  {
                    flex: 1,
                    fontSize: 15,
                    color: tc.ink,
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
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <X size={14} strokeWidth={2} color={tc.mute} />
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
            <View style={{ paddingHorizontal: 20, paddingTop: 32, alignItems: "center" }}>
              <AppText style={{ color: tc.mute, fontSize: 14 }}>
                Ничего не найдено
              </AppText>
            </View>
          ) : (
            filtered.map((opt) => {
              const isSel = opt.id === selectedId;
              const tintBg =
                opt.iconTint === "accent-soft"
                  ? tc["accent-soft"]
                  : opt.iconTint === "primary-soft"
                    ? tc["accent-soft"]
                    : tc["canvas-soft"];
              return (
                <Pressable
                  key={opt.id || "__empty"}
                  accessibilityRole="button"
                  accessibilityLabel={opt.title}
                  onPress={() => onSelect(opt.id)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 20,
                    paddingVertical: 6,
                    backgroundColor: pressed ? tc["canvas-soft"] : "transparent",
                  })}
                >
                  {opt.icon ? (
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isSel ? tc["accent-soft"] : tintBg,
                      }}
                    >
                      {opt.icon}
                    </View>
                  ) : null}

                  <View style={{ flex: 1 }}>
                    <AppText
                      weight={isSel ? "semibold" : "medium"}
                      style={{
                        color: isSel ? tc.accent : tc.ink,
                        fontSize: 16,
                        lineHeight: 22,
                      }}
                      numberOfLines={1}
                    >
                      {opt.title}
                    </AppText>
                    {opt.subtitle ? (
                      <AppText
                        style={{
                          color: tc.mute,
                          fontSize: 13,
                          lineHeight: 18,
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        {opt.subtitle}
                      </AppText>
                    ) : null}
                  </View>

                  {isSel ? (
                    <Check size={20} strokeWidth={2.25} color={tc.accent} />
                  ) : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
