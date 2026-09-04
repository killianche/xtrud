/**
 * GlassSurface — панель в материале Liquid Glass.
 *
 * DECISION владельца 2026-09-04: «пускай будет iOS Liquid Glass Design,
 * возьми оттуда базу».
 *
 * Liquid Glass — материал iOS 26: панель не закрашена, а преломляет то, что
 * под ней. Поэтому он уместен ровно там, где содержимое ПРОЕЗЖАЕТ под панелью:
 * закреплённая шапка, панель фильтров, плавающая кнопка. Заливать им карточки
 * в ленте нельзя — под ними ничего не движется, и стекло превращается в
 * дорогой серый прямоугольник.
 *
 * Правила, которые здесь соблюдены:
 *   - материал доступен не всем. `isLiquidGlassAvailable()` — это iOS 26+;
 *     на iOS 18 и на web возвращается обычная поверхность с волосяной
 *     границей, и экран остаётся правильным, а не «сломанным без стекла»;
 *   - стекло не кладётся на стекло. Внутри такой панели кнопки и чипы —
 *     обычные, с заливкой; иначе слои взаимно размывают друг друга;
 *   - материал сам меняет светлоту под содержимым, поэтому текст на нём
 *     берётся из токенов темы, как везде.
 */

import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, type StyleProp, View, type ViewStyle } from "react-native";

/** Есть ли на этом устройстве настоящий Liquid Glass (iOS 26+). */
export const LIQUID_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

export interface GlassSurfaceProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Классы NativeWind для запасной поверхности (без стекла). */
  fallbackClassName?: string;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
}

export function GlassSurface({
  children,
  style,
  fallbackClassName = "bg-canvas",
  pointerEvents,
}: GlassSurfaceProps) {
  if (LIQUID_GLASS) {
    return (
      <GlassView glassEffectStyle="regular" style={style} pointerEvents={pointerEvents}>
        {children}
      </GlassView>
    );
  }
  return (
    <View className={fallbackClassName} style={style} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
}
