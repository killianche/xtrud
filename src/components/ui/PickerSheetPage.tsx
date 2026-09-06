/**
 * PickerSheetPage — контент single-select picker'а, рассчитанный на нативную
 * `formSheet`-модальность (`Stack.Screen options={{ presentation: "formSheet", ... }}`),
 * а не на самописный `<Modal>`.
 *
 * Сестра `PickerSheet` (`./PickerSheet.tsx`) — та управляет собственной
 * видимостью (`open`/`onClose`) и full-screen `<Modal>`, и её продолжают
 * использовать `CitySelector`, `CinematicHero`, `MasterCinematicHero` (не
 * входят в зону перехода на нативные модальности, трогать их не нужно).
 * `PickerSheetPage` — для НОВЫХ route-экранов, где presentation/detents задаёт
 * `Stack.Screen` того route'а (UIKit презентует контроллер, а не смонтированный
 * JSX — `sheetAllowedDetents`/`sheetCornerRadius`/`sheetGrabberVisible` это
 * пропы экрана навигатора). Дублирование ~150 строк вёрстки списка с
 * `PickerSheet` — осознанное: два компонента с разной ответственностью
 * (владение видимостью vs чистый контент) дешевле держать раздельно, чем
 * тащить в один компонент режим "и Modal, и route content".
 *
 * Дизайн 1-в-1 с `PickerSheet` (см. историю редизайнов там): header
 * (bold title + опц. reset + close-X), hairline divider, опц. search-pill,
 * список опций с tinted square-иконкой + title/subtitle + круглый
 * filled-индикатор выбранной строки.
 *
 * `scrollable` переключает список между `ScrollView` (route открыт с массивом
 * detents вроде `[0.6, 1.0]` — card заполняет доступную высоту и скроллится)
 * и обычным `View` (обязательно для `sheetAllowedDetents: "fitToContents"` —
 * card измеряет естественную высоту контента, у `ScrollView` такой высоты нет).
 *
 * Использование (внутри route-экрана):
 *   <Stack.Screen options={{ presentation: "formSheet", sheetAllowedDetents: "fitToContents", sheetGrabberVisible: true }} />
 *   <PickerSheetPage
 *     title="Сортировка"
 *     scrollable={false}
 *     options={SORT_OPTIONS}
 *     selectedId={sortBy}
 *     onSelect={(id) => { setSortResult(id); router.back(); }}
 *     onClose={() => router.back()}
 *   />
 */

import { Check, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import type { PickerOption } from "@/components/ui/PickerSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useThemeColor } from "@/lib/use-theme-color";
import { SearchField } from "./SearchField";

/** Кол-во skeleton-строк в loading-состоянии — совпадает с типичной высотой
 *  видимой части списка, не всей длиной (список может быть на сотни строк,
 *  например L3-услуги — см. `app/(details)/category/l3-select.tsx`). */
const LOADING_ROW_COUNT = 6;

/** Круглый индикатор «выбрано» — см. `PickerSheet.tsx` (правило §A). */
function SelectedMark({ onPrimaryColor }: { onPrimaryColor: string }) {
  return (
    <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
      <Check size={13} weight="bold" color={onPrimaryColor} />
    </View>
  );
}

export interface PickerSheetPageProps {
  /** Закрыть route (обычно `() => router.back()`). Также вызывается reset-кнопкой. */
  onClose: () => void;
  /** Заголовок — большой bold (text-display-sm). */
  title: string;
  /** Subtitle под title — мелкая подсказка контекста. Опц. */
  subtitle?: string;
  options: PickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Показать search-input. По умолчанию автоматически если options.length >= 8. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Reset-кнопка в header справа. Вызывается → передаёт "" в onSelect. */
  resettable?: boolean;
  resetLabel?: string;
  /**
   * `true` (по умолчанию) — список в `ScrollView`. `false` — обычный `View`
   * без скролла: обязательно для route с `sheetAllowedDetents: "fitToContents"`.
   */
  scrollable?: boolean;
  /** Данные для `options` ещё грузятся — вместо списка/поиска skeleton-строки. */
  loading?: boolean;
  /** Загрузка упала — вместо списка текст ошибки + повтор. `options` игнорируются. */
  errorMessage?: string;
  onRetry?: () => void;
  /**
   * Множественный выбор (фильтр категорий): галочки у выбранных строк,
   * кнопка «Готово» внизу. `onSelect` в этом режиме не используется —
   * тап по строке зовёт `onToggle`.
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
  selectedId,
  onSelect,
  searchable,
  searchPlaceholder = "Поиск",
  resettable = false,
  resetLabel = "Сбросить",
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
  const muteColor = useThemeColor("mute");
  const onPrimaryColor = useThemeColor("on-primary");
  const onAccentColor = useThemeColor("on-accent");
  const [query, setQuery] = useState("");

  // loading/error — список ещё не пришёл, поиск скрываем (нечего искать).
  const showSearch = !loading && !errorMessage && (searchable ?? options.length >= 8);

  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) => o.title.toLowerCase().includes(q) || (o.subtitle?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query, showSearch]);

  const rows = loading ? (
    <View className="px-3 gap-1">
      {Array.from({ length: LOADING_ROW_COUNT }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: фиксированный набор строк-заглушек, порядок не меняется
        <View key={i} className="flex-row items-center gap-3 px-2 py-2.5">
          <Skeleton width={32} height={32} className="rounded-md" />
          <Skeleton height={16} className="flex-1 rounded" />
        </View>
      ))}
    </View>
  ) : errorMessage ? (
    <View accessibilityLiveRegion="polite" className="items-center px-5 pt-8">
      <AppText accessibilityRole="alert" className="text-center text-body-sm text-mute">
        {errorMessage}
      </AppText>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Повторить загрузку"
          onPress={onRetry}
          className="mt-3 min-h-11 justify-center rounded-full border border-hairline px-5 active:bg-canvas-soft"
        >
          <AppText weight="semibold" className="text-body-sm text-ink">
            Повторить
          </AppText>
        </Pressable>
      ) : null}
    </View>
  ) : filtered.length === 0 ? (
    <View className="px-5 pt-8 items-center">
      <AppText className="text-body-sm text-mute">Ничего не найдено</AppText>
    </View>
  ) : (
    filtered.map((opt) => {
      const isSel = multiSelect ? (selectedIds ?? []).includes(opt.id) : opt.id === selectedId;
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
            onPress={() => (multiSelect ? onToggle?.(opt.id) : onSelect(opt.id))}
            className={`flex-row items-center gap-3 rounded-lg px-2 py-2.5 active:bg-canvas-soft ${
              isSel && !multiSelect ? "bg-canvas-soft" : ""
            }`}
          >
            {opt.icon ? (
              <View className={`h-8 w-8 items-center justify-center rounded-md ${tintBgClass}`}>
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

            {multiSelect ? (
              <View
                className={`h-7 w-7 items-center justify-center rounded-full border ${
                  isSel ? "border-accent bg-accent" : "border-hairline-strong bg-canvas"
                }`}
              >
                {isSel ? <Check size={16} weight="bold" color={onAccentColor} /> : null}
              </View>
            ) : isSel ? (
              <SelectedMark onPrimaryColor={onPrimaryColor} />
            ) : null}
          </Pressable>
        </View>
      );
    })
  );

  return (
    // paddingTop: insets.top — обязательный отступ от чёлки (DECISION владельца
    // 2026-09-06: «на всём приложении, чтобы такого больше не было»). Внутри
    // настоящей шторки система отдаёт свой inset, на полном экране — высоту
    // статус-бара; в обоих случаях заголовок не заезжает под часы.
    <View
      className={`bg-canvas w-full ${scrollable ? "flex-1" : ""}`}
      style={{ paddingTop: insets.top }}
    >
      {/* Header: большой title слева + (опц) reset + лёгкий close-X справа. */}
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

      {/* Поиск внутри шторки — общий SearchField (правила Apple HIG).
          Своё поле было ниже минимальной тач-цели (40 pt) и со своим
          крестиком. */}
      {showSearch ? (
        <View className="px-4 pt-3 pb-1">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            showCancel={false}
          />
        </View>
      ) : null}

      {/* Options list — ScrollView для scroll-детентов, обычный View для
          fitToContents (там card измеряет естественную высоту контента). */}
      {scrollable ? (
        <ScrollView
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {rows}
        </ScrollView>
      ) : (
        <View style={{ paddingTop: 8, paddingBottom: insets.bottom + 16 }}>{rows}</View>
      )}
      {multiSelect ? (
        <View
          className="border-t border-hairline bg-canvas px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={doneLabel}
            onPress={onDone ?? onClose}
            className="min-h-13 items-center justify-center rounded-pill bg-accent active:opacity-85"
          >
            <AppText weight="semibold" className="text-button-lg text-on-accent">
              {(selectedIds?.length ?? 0) > 0 ? `${doneLabel} · ${selectedIds?.length}` : doneLabel}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
