// Защита строки состояния на главной.
//
// DECISION владельца 2026-09-03 по сборке 21: «когда скроллю, текст наезжает
// на время, сеть и батарею — нужно, чтобы они всегда читались».
//
// Почему так вышло: фото-герой на главной идёт от самого верха экрана (это
// задумано), под строкой состояния у него собственный тёмный градиент. Но
// когда герой уходит вверх, дальше под строку состояния попадает обычный
// контент на светлом фоне — и цифры времени сталкиваются с текстом карточек.
//
// Решение: непрозрачная полоса высотой safe-area, которая появляется, как
// только герой скроллится. Пока герой виден — полосы нет, работает его
// собственный градиент. Цвет берётся из токена `canvas`, поэтому обе темы
// корректны. Полоса не перехватывает касания (pointerEvents="none").

import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useThemeColor } from "@/lib/use-theme-color";

/** Сколько нужно проскроллить, чтобы полоса стала непрозрачной. */
export const HOME_STATUS_BAR_COVER_OFFSET = 24;

export function HomeStatusBarCover({ visible }: { visible: boolean }) {
  const insets = useSafeAreaInsets();
  const canvas = useThemeColor("canvas");
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    const toValue = visible ? 1 : 0;
    if (reducedMotion) {
      opacity.setValue(toValue);
      return;
    }
    Animated.timing(opacity, {
      toValue,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [opacity, reducedMotion, visible]);

  // На устройствах без выреза inset может быть 0 — тогда закрывать нечего.
  if (insets.top === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      // Строка состояния — часть системного интерфейса, для VoiceOver эта
      // полоса пустая и не должна попадать в порядок обхода.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: canvas,
        opacity,
      }}
    >
      <View className="absolute bottom-0 left-0 right-0 h-px bg-hairline" />
    </Animated.View>
  );
}
