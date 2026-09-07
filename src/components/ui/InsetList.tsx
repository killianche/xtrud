/**
 * InsetGroup / InsetRow — список inset grouped, как в Настройках iOS:
 * группа со скруглёнными углами на сером фоне, заголовок группы Footnote
 * заглавными, строки 56 pt с плиткой иконки 36×36, разделитель от текста,
 * справа — значение и chevron (строка ведёт дальше) или галочка (выбор).
 *
 * Общий строительный блок конструктора задания, профиля специалиста и
 * настроек (DECISION владельца 2026-09-07: «всё крупнее, как в iOS»).
 */

import { CaretRight, Check } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/AppText";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";
import { SystemIcon } from "./SystemIcon";

export function InsetGroup({
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

export interface InsetRowProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Плитка иконки в фирменном цвете. */
  iconAccent?: boolean;
  selected?: boolean;
  /** Галочка справа без заливки строки — выбор в списке фильтров/настроек. */
  checked?: boolean;
  /** Строка ведёт дальше (chevron), а не выбирает. */
  navigates?: boolean;
  /** Значение справа. */
  value?: string;
  /** Переключатель справа вместо значения. */
  toggle?: { value: boolean; onChange: (next: boolean) => void };
  onPress?: () => void;
  last?: boolean;
  disabled?: boolean;
  /** Текст и плитка в цвете ошибки/удаления. */
  destructive?: boolean;
}

export function InsetRow({
  title,
  subtitle,
  icon,
  iconAccent = false,
  selected = false,
  checked = false,
  navigates = false,
  value,
  toggle,
  onPress,
  last = false,
  disabled = false,
  destructive = false,
}: InsetRowProps) {
  const tc = useThemeColors(["accent", "mute", "error", "hairline-strong"]);
  const interactive = !!onPress && !toggle;
  return (
    <Pressable
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityState={{ selected: selected || checked, disabled, checked: toggle?.value }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : value ? `${title}, ${value}` : title}
      disabled={disabled || (!onPress && !toggle)}
      onPress={() => {
        if (toggle) {
          hapticSelection();
          toggle.onChange(!toggle.value);
          return;
        }
        if (!navigates) hapticSelection();
        onPress?.();
      }}
      className={`flex-row items-center pl-4 ${interactive || toggle ? "active:bg-canvas-soft" : ""} ${
        selected ? "bg-accent-soft" : ""
      }`}
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
            className={`text-ios-body ${destructive ? "text-error" : "text-ink"}`}
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
        {toggle ? (
          <Switch
            value={toggle.value}
            onValueChange={toggle.onChange}
            trackColor={{ true: tc.accent, false: tc["hairline-strong"] }}
            disabled={disabled}
          />
        ) : navigates ? (
          <View className="ml-2">
            <SystemIcon
              sf="chevron.right"
              fallback={CaretRight}
              size={14}
              weight="semibold"
              color={tc.mute}
            />
          </View>
        ) : selected || checked ? (
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
