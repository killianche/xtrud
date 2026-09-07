/**
 * FloatingActionButton — плавающая кнопка главного действия внизу справа.
 *
 * DECISION владельца 2026-09-06 (вечер): «„+“ из правого верхнего угла —
 * плавающим снизу справа, как обычно у iOS». У Apple в iOS 26 так живёт
 * «новая заметка» в Заметках и «написать» в Почте: круглая стеклянная кнопка
 * над нижним меню, справа, с символом в фирменном цвете.
 *
 * Правила:
 *   - 56 pt, круг на светлой поверхности с тенью и акцентным символом — как
 *     плавающие кнопки в Картах; стекло здесь не используется: на фото и
 *     тёмной рекламе оно исчезало (владелец, 2026-09-07);
 *   - стоит над нижним меню на `useTabBarSpace()` — не перекрывает панель и
 *     не уезжает под неё;
 *   - одна на экран, только для главного действия экрана (design-quality §1.1);
 *   - VoiceOver: роль кнопки и подпись обязательны.
 */

import { Plus } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";
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
  const tc = useThemeColors(["accent"]);
  // Мягкое появление (кнопка на главной показывается при прокрутке).
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [opacity]);

  // Круг на светлой поверхности с тенью — читается и на фото, и на тёмной
  // рекламе (владелец, 2026-09-07: «плюсик без фона — сделай кнопку»).
  const icon = <SystemIcon sf={sf} fallback={fallback} size={26} weight="bold" color={tc.accent} />;

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
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <View
          className="border border-hairline bg-canvas"
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
        </View>
      </Pressable>
    </Animated.View>
  );
}
