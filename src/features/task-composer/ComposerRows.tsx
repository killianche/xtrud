/**
 * Строки выбора конструктора — inset grouped список, как в Настройках:
 * группа со скруглёнными углами на сером фоне, строки 44+ pt, плитка иконки
 * 29×29, разделитель от текста, выбранное — checkmark в фирменном цвете.
 * Множественный выбор здесь не нужен: каждый вопрос — один ответ.
 */

import { CaretRight, Check } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

export function ChoiceGroup({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: string;
}) {
  return (
    <View className="mb-7 px-4">
      {title ? (
        <AppText className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute">{title}</AppText>
      ) : null}
      <View className="overflow-hidden rounded-2xl bg-canvas">{children}</View>
      {footer ? (
        <AppText className="mt-1.5 ml-4 text-ios-footnote text-mute">{footer}</AppText>
      ) : null}
    </View>
  );
}

export interface ChoiceRowProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Плитка иконки в фирменном цвете (для «раздела», «всех категорий»). */
  iconAccent?: boolean;
  selected?: boolean;
  /** Строка ведёт дальше (chevron), а не выбирает. */
  navigates?: boolean;
  /** Значение справа (для строк проверки). */
  value?: string;
  onPress: () => void;
  last?: boolean;
  disabled?: boolean;
}

export function ChoiceRow({
  title,
  subtitle,
  icon,
  iconAccent = false,
  selected = false,
  navigates = false,
  value,
  onPress,
  last = false,
  disabled = false,
}: ChoiceRowProps) {
  const tc = useThemeColors(["accent", "mute"]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      disabled={disabled}
      onPress={() => {
        if (!navigates) hapticSelection();
        onPress();
      }}
      className={`flex-row items-center pl-4 active:bg-canvas-soft ${selected ? "bg-accent-soft" : ""}`}
    >
      {icon ? (
        <View
          className={`mr-3 h-9 w-9 items-center justify-center rounded-lg ${
            iconAccent ? "bg-accent" : "bg-canvas-soft"
          }`}
        >
          {icon}
        </View>
      ) : null}
      <View
        className={`min-h-14 flex-1 flex-row items-center py-3 pr-4 ${last ? "" : "border-b border-hairline"}`}
      >
        <View className="min-w-0 flex-1">
          <AppText
            weight={selected ? "semibold" : "regular"}
            className="text-ios-body text-ink"
            numberOfLines={2}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText className="mt-0.5 text-ios-footnote text-mute" numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {value ? (
          <AppText
            className="ml-3 max-w-[45%] text-right text-ios-body text-mute"
            numberOfLines={1}
          >
            {value}
          </AppText>
        ) : null}
        {navigates ? (
          <View className="ml-2">
            <SystemIcon
              sf="chevron.right"
              fallback={CaretRight}
              size={14}
              weight="semibold"
              color={tc.mute}
            />
          </View>
        ) : selected ? (
          <View className="ml-2">
            <SystemIcon
              sf="checkmark"
              fallback={Check}
              size={17}
              weight="semibold"
              color={tc.accent}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
