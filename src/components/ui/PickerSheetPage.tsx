/**
 * PickerSheetPage — содержимое шторки выбора в стиле системных шторок iOS 26.
 *
 * Рассчитан на нативную `formSheet`-модальность (`Stack.Screen
 * options={{ presentation: "formSheet", … }}`), а не на самописный `<Modal>`.
 * Сестра `PickerSheet` (`./PickerSheet.tsx`) владеет собственной видимостью
 * и full-screen `<Modal>`; её продолжают использовать `CitySelector`,
 * `CinematicHero`, `MasterCinematicHero` — не входят в зону перехода на
 * нативные модальности.
 *
 * DECISION владельца 2026-09-06 (вечер): «заголовок категории маленький —
 * нужно как на iOS; выбранное незаметно; непонятно, что „весь раздел“ — это
 * раздел, а не пункт». Как устроено у Apple и здесь:
 *
 *   1. Заголовок шторки — Title 1 (28/bold) слева, справа системный
 *      «закрыть» xmark.circle.fill 30 pt (Карты, Погода, App Store).
 *   2. Список — inset grouped: группы со скруглёнными углами на сером фоне,
 *      заголовок группы — Footnote 13 заглавными (как в Настройках).
 *      Группа = раздел каталога; первая строка группы «Весь раздел» —
 *      с залитой акцентом плиткой иконки и полужирным текстом.
 *   3. Строка — 44+ pt: плитка иконки 29×29 (как иконки в Настройках),
 *      текст Body 17, разделитель от текста, не от края.
 *   4. Выбранное — галочка SF `checkmark` в фирменном цвете справа И лёгкая
 *      акцентная подложка строки: у Apple достаточно галочки, но владелец
 *      просил заметнее. Множественный выбор — `checkmark.circle.fill` /
 *      `circle`, как в выборе фото.
 *
 * `scrollable` переключает список между `ScrollView` (detents вроде
 * `[0.7, 1.0]`) и обычным `View` (для `sheetAllowedDetents: "fitToContents"`,
 * где карточка измеряет естественную высоту содержимого).
 */

import { XCircle } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import { SearchField } from "./SearchField";
import { SystemIcon } from "./SystemIcon";

/** Кол-во skeleton-строк в loading-состоянии — видимая часть, не весь список. */

import { PickerSections, type PickerSheetRow, type PickerSheetSection } from "./PickerSections";

export type { PickerSheetRow, PickerSheetSection };

export interface PickerSheetPageProps {
  /** Закрыть route (обычно `() => router.back()`). Также вызывается reset-кнопкой. */
  onClose: () => void;
  /** Заголовок шторки — Title 1. */
  title: string;
  /** Подзаголовок под title — Subheadline. */
  subtitle?: string;
  /** Плоский список — одна группа без заголовка. */
  options?: PickerSheetRow[];
  /** Группы (inset grouped). Если заданы, `options` не используется. */
  sections?: PickerSheetSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Показать поиск. По умолчанию — если строк 8 и больше. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Кнопка сброса в шапке справа. Зовёт `onReset`, а без него — `onSelect("")`. */
  resettable?: boolean;
  resetLabel?: string;
  /** Сброс выбора; обязателен в multiSelect, где `onSelect` не используется. */
  onReset?: () => void;
  /**
   * `true` (по умолчанию) — список в `ScrollView`. `false` — обычный `View`
   * без скролла: обязательно для route с `sheetAllowedDetents: "fitToContents"`.
   */
  scrollable?: boolean;
  /** Данные ещё грузятся — skeleton-строки вместо списка и поиска. */
  loading?: boolean;
  /** Загрузка упала — текст ошибки и «Повторить». */
  errorMessage?: string;
  onRetry?: () => void;
  /**
   * Множественный выбор: кружки-галочки у строк, «Готово» внизу.
   * `onSelect` не используется — тап по строке зовёт `onToggle`.
   */
  multiSelect?: boolean;
  selectedIds?: readonly string[];
  onToggle?: (id: string) => void;
  onDone?: () => void;
  doneLabel?: string;
}

export function PickerSheetPage({
  onClose,
  title,
  subtitle,
  options,
  sections,
  selectedId,
  onSelect,
  searchable,
  searchPlaceholder = "Поиск",
  resettable = false,
  resetLabel = "Сбросить",
  onReset,
  scrollable = true,
  loading = false,
  errorMessage,
  onRetry,
  multiSelect = false,
  selectedIds,
  onToggle,
  onDone,
  doneLabel = "Готово",
}: PickerSheetPageProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "mute", "accent", "on-accent", "hairline-strong"]);
  const [query, setQuery] = useState("");

  const allSections = useMemo<PickerSheetSection[]>(
    () => sections ?? [{ id: "__flat", options: options ?? [] }],
    [sections, options],
  );
  const totalRows = allSections.reduce((n, s) => n + s.options.length, 0);

  // loading/error — списка ещё нет, поиск прячем (нечего искать).
  const showSearch = !loading && !errorMessage && (searchable ?? totalRows >= 8);

  return (
    // paddingTop: insets.top — обязательный отступ от чёлки (DECISION владельца
    // 2026-09-06). Внутри настоящей шторки система отдаёт свой inset, на
    // полном экране — высоту статус-бара.
    <View
      className={`w-full bg-surface-page ${scrollable ? "flex-1" : ""}`}
      style={{ paddingTop: insets.top }}
    >
      {/* Шапка: Title 1 слева, сброс и системный «закрыть» справа. */}
      <View className="flex-row items-start gap-3 px-4 pt-4 pb-2">
        <View className="min-w-0 flex-1 pt-0.5">
          <AppText weight="bold" className="text-ios-title1 text-ink" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText className="mt-0.5 text-ios-subheadline text-mute" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>

        {resettable && (multiSelect ? (selectedIds?.length ?? 0) > 0 : !!selectedId) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={resetLabel}
            onPress={() => {
              if (onReset) onReset();
              else onSelect("");
              setQuery("");
            }}
            hitSlop={8}
            className="min-h-8 justify-center px-1 active:opacity-60"
          >
            <AppText className="text-ios-body text-accent">{resetLabel}</AppText>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={onClose}
          hitSlop={10}
          className="h-8 w-8 items-center justify-center active:opacity-60"
        >
          <SystemIcon
            sf="xmark.circle.fill"
            fallback={XCircle}
            size={30}
            weight="regular"
            hierarchical
            color={tc.mute}
          />
        </Pressable>
      </View>

      {showSearch ? (
        <View className="px-4 pt-1 pb-2">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            showCancel={false}
          />
        </View>
      ) : null}

      {scrollable ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <PickerSections
            sections={allSections}
            selectedId={selectedId}
            onSelect={onSelect}
            query={showSearch ? query : ""}
            loading={loading}
            errorMessage={errorMessage}
            onRetry={onRetry}
            multiSelect={multiSelect}
            selectedIds={selectedIds}
            onToggle={onToggle}
          />
        </ScrollView>
      ) : (
        <View style={{ paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
          <PickerSections
            sections={allSections}
            selectedId={selectedId}
            onSelect={onSelect}
            query={showSearch ? query : ""}
            loading={loading}
            errorMessage={errorMessage}
            onRetry={onRetry}
            multiSelect={multiSelect}
            selectedIds={selectedIds}
            onToggle={onToggle}
          />
        </View>
      )}

      {multiSelect ? (
        <View className="bg-surface-page px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={doneLabel}
            onPress={onDone ?? onClose}
            className="min-h-[50px] items-center justify-center rounded-2xl bg-accent active:opacity-85"
          >
            <AppText weight="semibold" className="text-ios-body text-on-accent">
              {(selectedIds?.length ?? 0) > 0 ? `${doneLabel} · ${selectedIds?.length}` : doneLabel}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
