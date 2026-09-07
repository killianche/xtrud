/**
 * FloatingActionButton — плавающая кнопка главного действия внизу справа.
 *
 * DECISION владельца 2026-09-06 (вечер): «„+“ из правого верхнего угла —
 * плавающим снизу справа, как обычно у iOS». У Apple в iOS 26 так живёт
 * «новая заметка» в Заметках и «написать» в Почте: круглая стеклянная кнопка
 * над нижним меню, справа, с символом в фирменном цвете.
 *
 * Правила:
 *   - 56 pt, круг, Liquid Glass; без стекла (iOS до 26) — заливка акцентом с
 *     тенью, символ белый;
 *   - стоит над нижним меню на `useTabBarSpace()` — не перекрывает панель и
 *     не уезжает под неё;
 *   - одна на экран, только для главного действия экрана (design-quality §1.1);
 *   - VoiceOver: роль кнопки и подпись обязательны.
 */

import { Plus } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { Animated, Pressable } from "react-native";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
import { GlassSurface, LIQUID_GLASS } from "./GlassSurface";
import { type SFSymbol, SystemIcon } from "./SystemIcon";

const SIZE = 56;
/** Отступ кнопки от нижнего меню. */
const GAP = 16;
/** Сколько места снизу резервировать списку под этой кнопкой: передавать в
 *  `useTabBarSpace(FAB_LIST_SPACE)`, иначе кнопка ляжет на последнюю карточку. */
export const FAB_LIST_SPACE = GAP + SIZE + 12;

export interface FloatingActionButtonProps {
  label: string;
  onPress: () => void;
  sf?: SFSymbol;
  fallback?: IconComponent;
}

export function FloatingActionButton({
  label,
  onPress,
  sf = "plus",
  fallback = Plus,
}: FloatingActionButtonProps) {
  const bottom = useTabBarSpace(GAP);
  const tc = useThemeColors(["accent", "on-accent"]);
  // Мягкое появление (кнопка на главной показывается при прокрутке).
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [opacity]);

  const icon = (
    <SystemIcon
      sf={sf}
      fallback={fallback}
      size={24}
      weight="bold"
      color={LIQUID_GLASS ? tc.accent : tc["on-accent"]}
    />
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: "absolute", right: 20, bottom, zIndex: 20, opacity }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        hitSlop={4}
        className="active:opacity-70"
        style={
          LIQUID_GLASS
            ? undefined
            : {
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }
        }
      >
        <GlassSurface
          fallbackClassName="bg-accent"
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {icon}
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}
