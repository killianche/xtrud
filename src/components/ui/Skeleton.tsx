/**
 * Skeleton — placeholder с pulse-анимацией для loading-states.
 *
 * Используем `Animated.View` с opacity loop (0.55 → 1 → 0.55, 1100ms).
 * Native + web-совместимо (Animated работает в RNW через JS-driver).
 * Цвет — `bg-canvas-soft-2` (light: #f5f5f5, dark: #1a1a1a) через NativeWind
 * className, чтобы dark mode работал автоматически.
 *
 * Варианты:
 *   <Skeleton width={120} height={16} />                       — прямоугольник
 *   <Skeleton className="h-4 w-32 rounded" />                  — через className
 *   <Skeleton circle size={56} />                              — круг (аватар)
 *   <Skeleton className="h-20 rounded-xl" />                   — flex-stretched
 *
 * Anti-pattern: НЕ используем `<ActivityIndicator>` на пустом экране —
 * показываем skeleton-формы реального layout'а (cм. design-quality.md §5).
 */

import { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export interface SkeletonProps {
  /** Если задан — width в px. Иначе ширина наследуется от родителя (flex). */
  width?: number | string;
  /** Если задан — height в px. Иначе наследуется. */
  height?: number | string;
  /** Круг (avatar). Если true, используется size как диаметр (или width). */
  circle?: boolean;
  /** Для круга — диаметр (px). Если не задан, берётся width. */
  size?: number;
  /** Tailwind className — для radius/sizing/margin. */
  className?: string;
  /** Inline-style — для случаев когда нужны px-значения, не tw. */
  style?: ViewStyle;
}

export function Skeleton({ width, height, circle = false, size, className, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.55)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // Пульс — декоративный, при «Уменьшении движения» выключается целиком:
    // форма skeleton'а остаётся видна статично, без loop (design-quality.md §2).
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  const diameter = circle ? (size ?? (typeof width === "number" ? width : 40)) : undefined;

  const computedStyle: ViewStyle = {
    ...(width !== undefined ? { width: width as ViewStyle["width"] } : null),
    ...(height !== undefined ? { height: height as ViewStyle["height"] } : null),
    ...(circle && diameter
      ? { width: diameter, height: diameter, borderRadius: diameter / 2 }
      : null),
    ...style,
  };

  return (
    <Animated.View
      // bg-canvas-soft-2 — токен из colors.ts, в dark mode правильно тёмный.
      // Без border — skeleton сам себе бордер не рисует, иначе двойной.
      className={`bg-canvas-soft-2 ${className ?? ""}`.trim()}
      style={[computedStyle, { opacity }]}
    />
  );
}
