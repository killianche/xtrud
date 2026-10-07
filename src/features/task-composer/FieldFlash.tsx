/**
 * FieldFlash — мягкая подсветка раздела формы на секунду (№290, владелец
 * 2026-10-07: «если я нажал и мне подсказывают, что надо заполнить, оно
 * должно немножко подсветиться на секунду»).
 *
 * Розовая подложка за разделом проявляется и гаснет; содержимое не
 * сдвигается. «Уменьшение движения» — подложка без анимации, на то же
 * время. Каждое новое значение `trigger` (> 0) — новая вспышка.
 */

import { type ReactNode, useEffect, useRef } from "react";
import { Animated, type LayoutChangeEvent, View } from "react-native";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function FieldFlash({
  trigger,
  onLayout,
  children,
}: {
  trigger: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  // Тот же Animated + className-токен, что у Skeleton: обе темы из токенов.
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger <= 0) return;
    opacity.stopAnimation();
    const animation = reduced
      ? Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.delay(1000),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      : Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.delay(600),
          Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]);
    animation.start();
    return () => animation.stop();
  }, [trigger, reduced, opacity]);

  return (
    <View onLayout={onLayout}>
      {/* Слой появляется с первой вспышкой: пустой раздел (категория,
          которую ставит сервер) не несёт лишнего невидимого элемента.
          Анимируется только прозрачность; цвет — классом токена на обычном
          View внутри (на Animated.View класс не применялся в вебе). */}
      {trigger > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", left: 8, right: 8, top: -6, bottom: -6, opacity }}
        >
          <View className="flex-1 rounded-3xl bg-accent-soft" />
        </Animated.View>
      ) : null}
      {children}
    </View>
  );
}
