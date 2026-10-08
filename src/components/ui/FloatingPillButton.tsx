/**
 * FloatingPillButton — плавающая розовая капсула по центру внизу экрана:
 * главное действие поверх списка. «Уточнить» в «Найти задание» (№294, №316)
 * и «Показать весь раздел» в шторке подкатегорий (№320) — один вид.
 *
 * Обёртка пропускает касания мимо кнопки (box-none): список под ней
 * листается и нажимается. Список оставляет снизу FLOATING_PILL_SPACE.
 */

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SHADOW_COLOR } from "@/lib/shadows";

/** Место под капсулой: кнопка 48 pt + зазоры. */
export const FLOATING_PILL_SPACE = 16 + 48 + 12;

export function FloatingPillButton({
  label,
  accessibilityLabel,
  icon,
  onPress,
  bottom,
  collapsed = false,
}: {
  label: string;
  accessibilityLabel?: string;
  /** Иконка слева, цвет — on-accent. */
  icon?: ReactNode;
  onPress: () => void;
  /** Отступ от низа экрана (с безопасной областью). */
  bottom: number;
  /**
   * Свёрнута в розовый круг с иконкой — при прокрутке вниз, чтобы не
   * закрывать список (№323). Метка для VoiceOver остаётся.
   */
  collapsed?: boolean;
}) {
  const round = collapsed && !!icon;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom, alignItems: "center" }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={onPress}
        hitSlop={4}
        className={`min-h-12 flex-row items-center justify-center rounded-pill bg-accent active:opacity-85 ${
          round ? "w-12" : "max-w-[85%] gap-2 px-5"
        }`}
        style={{
          shadowColor: SHADOW_COLOR,
          shadowOpacity: 0.14,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        {icon}
        {round ? null : (
          <AppText
            weight="semibold"
            className="shrink text-ios-body text-on-accent"
            numberOfLines={1}
          >
            {label}
          </AppText>
        )}
      </Pressable>
    </View>
  );
}
