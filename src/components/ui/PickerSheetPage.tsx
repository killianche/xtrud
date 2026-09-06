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

import { Check, XCircle } from "phosphor-react-native";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import type { PickerOption } from "@/components/ui/PickerSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
import { SearchField } from "./SearchField";
import { SystemIcon } from "./SystemIcon";

/** Кол-во skeleton-строк в loading-состоянии — видимая часть, не весь список. */
const LOADING_ROW_COUNT = 6;

/** Запасной пустой кружок множественного выбора (без SF Symbols). */
const RingFallback: IconComponent = ({ size = 24, color }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: 1.5,
      borderColor: typeof color === "string" ? color : undefined,
    }}
  />
);

export interface PickerSheetRow extends PickerOption {
  /** Строка «весь раздел»: полужирный текст и плитка, залитая акцентом. */
  emphasis?: boolean;
}

export interface PickerSheetSection {
  id: string;
  /** Заголовок группы. Без него группа рисуется без подписи. */
  title?: string;
  options: PickerSheetRow[];
}

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

  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!showSearch || !q) return allSections;
    return allSections
      .map((s) => ({
        ...s,
        options: s.options.filter(
          (o) =>
            o.title.toLowerCase().includes(q) ||
            (o.subtitle?.toLowerCase().includes(q) ?? false) ||
            (s.title?.toLowerCase().includes(q) ?? false),
        ),
      }))
      .filter((s) => s.options.length > 0);
  }, [allSections, query, showSearch]);

  const isSelected = (id: string) =>
    multiSelect ? (selectedIds ?? []).includes(id) : id === selectedId;

  const renderRow = (opt: PickerSheetRow, isLast: boolean) => {
    const isSel = isSelected(opt.id);
    const tileClass = opt.emphasis
      ? "bg-accent"
      : opt.iconTint === "accent-soft" || opt.iconTint === "primary-soft"
        ? "bg-accent-soft"
        : "bg-canvas-soft";
    return (
      <Pressable
        key={opt.id || "__empty"}
        accessibilityRole="button"
        accessibilityState={{ selected: isSel }}
        accessibilityLabel={opt.subtitle ? `${opt.title}, ${opt.subtitle}` : opt.title}
        onPress={() => (multiSelect ? onToggle?.(opt.id) : onSelect(opt.id))}
        className={`flex-row items-center pl-4 active:bg-canvas-soft ${
          isSel && !multiSelect ? "bg-accent-soft" : "bg-canvas"
        }`}
      >
        {opt.icon ? (
          <View
            className={`mr-3 h-[29px] w-[29px] items-center justify-center rounded-[7px] ${tileClass}`}
          >
            {opt.icon}
          </View>
        ) : null}
        <View
          className={`min-h-11 flex-1 flex-row items-center py-2.5 pr-4 ${
            isLast ? "" : "border-b border-hairline"
          }`}
        >
          <View className="min-w-0 flex-1">
            <AppText
              weight={opt.emphasis || isSel ? "semibold" : "regular"}
              className="text-ios-body text-ink"
              numberOfLines={1}
            >
              {opt.title}
            </AppText>
            {opt.subtitle ? (
              <AppText className="mt-0.5 text-ios-footnote text-mute" numberOfLines={1}>
                {opt.subtitle}
              </AppText>
            ) : null}
          </View>
          {multiSelect ? (
            <SystemIcon
              sf={isSel ? "checkmark.circle.fill" : "circle"}
              fallback={isSel ? Check : RingFallback}
              size={24}
              weight="regular"
              color={isSel ? tc.accent : tc["hairline-strong"]}
            />
          ) : isSel ? (
            <SystemIcon
              sf="checkmark"
              fallback={Check}
              size={17}
              weight="semibold"
              color={tc.accent}
            />
          ) : null}
        </View>
      </Pressable>
    );
  };

  let body: ReactNode;
  if (loading) {
    body = (
      <View className="mx-4 overflow-hidden rounded-2xl bg-canvas">
        {Array.from({ length: LOADING_ROW_COUNT }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: фиксированный набор строк-заглушек
          <View key={i} className="flex-row items-center gap-3 px-4 py-2.5">
            <Skeleton width={29} height={29} className="rounded-[7px]" />
            <Skeleton height={17} className="flex-1 rounded" />
          </View>
        ))}
      </View>
    );
  } else if (errorMessage) {
    body = (
      <View accessibilityLiveRegion="polite" className="items-center px-5 pt-8">
        <AppText accessibilityRole="alert" className="text-center text-ios-subheadline text-mute">
          {errorMessage}
        </AppText>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку"
            onPress={onRetry}
            className="mt-3 min-h-11 justify-center rounded-full bg-canvas px-5 active:opacity-60"
          >
            <AppText weight="semibold" className="text-ios-body text-accent">
              Повторить
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  } else if (visibleSections.length === 0) {
    body = (
      <View className="items-center px-5 pt-8">
        <AppText className="text-ios-subheadline text-mute">Ничего не найдено</AppText>
      </View>
    );
  } else {
    body = visibleSections.map((section) => (
      <View key={section.id} className="mb-5">
        {section.title ? (
          <AppText className="mb-1.5 ml-8 text-ios-footnote uppercase text-mute" numberOfLines={1}>
            {section.title}
          </AppText>
        ) : null}
        <View className="mx-4 overflow-hidden rounded-2xl bg-canvas">
          {section.options.map((opt, i) => renderRow(opt, i === section.options.length - 1))}
        </View>
      </View>
    ));
  }

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
          {body}
        </ScrollView>
      ) : (
        <View style={{ paddingTop: 8, paddingBottom: insets.bottom + 16 }}>{body}</View>
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
