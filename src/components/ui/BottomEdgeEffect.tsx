/**
 * Размытие у нижнего края под плавающими кнопками — зеркало ScrollEdgeEffect.
 *
 * Владелец, 2026-10-03 (скриншот задания): «Откликнуться» лежала прямо на
 * тексте и картинках и сливалась с ними — «нужно градиентное размытие под
 * кнопкой». Как нижние панели iOS 26: содержимое под кнопкой размывается и
 * растворяется в цвет фона. Тот же слой, что под заголовком, у нижнего края:
 * сплошной от края экрана до верха кнопок (`solid`), выше — растворение за
 * `fade` pt. Кнопка целиком лежит на сплошном слое — сквозь неактивную
 * стеклянную кнопку текст не просвечивает (скриншот 2026-10-03).
 *
 * Декоративный: касания проходят насквозь, VoiceOver его не видит.
 */

import { View } from "react-native";
import { EDGE_FADE, ScrollEdgeEffect } from "./ScrollEdgeEffect";

export function BottomEdgeEffect({
  solid,
  fade = EDGE_FADE,
}: {
  /** Высота сплошного слоя от нижнего края — до верха кнопок, pt. */
  solid: number;
  /** На сколько pt выше кнопок размытие сходит на нет. */
  fade?: number;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: solid + fade,
      }}
    >
      <ScrollEdgeEffect edge="bottom" fade={fade} />
    </View>
  );
}
