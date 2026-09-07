/**
 * PickerSections — один список выбора для всего приложения: inset-группы по
 * разделам, плитка иконки 29 pt, выбранная строка — галочка (или кружок при
 * множественном выборе), поиск по названию, состояния загрузки/ошибки/пусто.
 * Используется шторками выбора (`PickerSheetPage`) и первым шагом
 * конструктора задания — DECISION владельца 2026-09-07: «категории при
 * размещении задания и в фильтре — один единый стиль».
 */

import { Check } from "phosphor-react-native";
import { type ReactNode, useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { PickerOption } from "@/components/ui/PickerSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
import { SystemIcon } from "./SystemIcon";

const LOADING_ROW_COUNT = 6;

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

export interface PickerSectionsProps {
  sections: PickerSheetSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Строка поиска — фильтр по названию, подписи и заголовку группы. */
  query?: string;
  loading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  multiSelect?: boolean;
  selectedIds?: readonly string[];
  onToggle?: (id: string) => void;
  emptyText?: string;
}

export function PickerSections({
  sections: allSections,
  selectedId,
  onSelect,
  query = "",
  loading = false,
  errorMessage,
  onRetry,
  multiSelect = false,
  selectedIds,
  onToggle,
  emptyText = "Ничего не найдено",
}: PickerSectionsProps) {
  const tc = useThemeColors(["accent", "hairline-strong"]);
  const showSearch = true;
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
  }, [allSections, query]);

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
        <AppText className="text-ios-subheadline text-mute">{emptyText}</AppText>
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

  return <>{body}</>;
}
