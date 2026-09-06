/**
 * SystemIcon — системный символ iOS (SF Symbols) с запасной иконкой Phosphor.
 *
 * DECISION владельца 2026-09-06 (вечер): «мы ориентируемся на iOS последней
 * версии: изучи, какие иконки там используются, какие размеры и шрифты — и
 * делай так же». Поэтому служебные иконки интерфейса — «назад», «закрыть»,
 * галочка выбора, «+», стрелка чипа, лупа поиска — на iOS берутся из
 * SF Symbols, тех же, что рисует система в своих приложениях.
 *
 * Границы:
 *   - только служебные (chrome) иконки; иконки категорий и содержимого —
 *     Phosphor в одном стиле (референс Thumbtack, DECISION 2026-09-05);
 *   - на Android и web рисуется запасная Phosphor-иконка того же смысла —
 *     экран остаётся правильным без SF Symbols;
 *   - размер задаётся в pt как у Apple: 17 — в строках и кнопках-тексте,
 *     22 — в строке навигации, 26–30 — крупные индикаторы (xmark.circle.fill).
 */

import { SymbolView, type SymbolWeight } from "expo-symbols";
import { Platform, type StyleProp, type ViewStyle } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import type { IconComponent } from "@/types/icon";

export type { SFSymbol };

const SF_AVAILABLE = Platform.OS === "ios";

/** Вес Phosphor для запасной иконки — по весу символа. */
function phosphorWeight(weight: SymbolWeight): "regular" | "bold" | "fill" {
  return weight === "bold" || weight === "heavy" || weight === "black" || weight === "semibold"
    ? "bold"
    : "regular";
}

export interface SystemIconProps {
  /** Имя SF Symbol, например "chevron.left" или "xmark.circle.fill". */
  sf: SFSymbol;
  /** Запасная иконка Phosphor того же смысла (Android, web). */
  fallback: IconComponent;
  size?: number;
  color: string;
  weight?: SymbolWeight;
  /** Двухслойный символ (xmark.circle.fill: крестик + круг разной плотности). */
  hierarchical?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SystemIcon({
  sf,
  fallback: Fallback,
  size = 17,
  color,
  weight = "semibold",
  hierarchical = false,
  style,
}: SystemIconProps) {
  if (!SF_AVAILABLE) {
    return <Fallback size={size} weight={phosphorWeight(weight)} color={color} />;
  }
  return (
    <SymbolView
      name={sf}
      size={size}
      tintColor={color}
      weight={weight}
      type={hierarchical ? "hierarchical" : "monochrome"}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
      fallback={<Fallback size={size} weight={phosphorWeight(weight)} color={color} />}
    />
  );
}
