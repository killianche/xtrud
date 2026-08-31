// useReducedMotion — единая точка чтения системной настройки «Уменьшение
// движения» (iOS: Settings → Accessibility → Motion → Reduce Motion).
//
// Reanimated-анимации (withTiming/withSpring без явного `reduceMotion`) уже
// уважают эту настройку САМИ: `reduceMotion` по умолчанию — `ReduceMotion.System`,
// и при включённой системной настройке withTiming/withSpring прыгают сразу в
// toValue вместо анимации (react-native-reanimated/src/animation/util.ts,
// проверено в node_modules — 4.5.1). Для такого кода этот хук не нужен.
//
// Он нужен там, где анимация сделана не через Reanimated (RN `Animated`,
// автовоспроизводящийся слайдер) — эту библиотеку система сама не выключает,
// поэтому проверку приходится делать явно. Чтобы это не превращалось в
// AccessibilityInfo.isReduceMotionEnabled() в каждом файле, весь проект читает
// настройку через один этот хук.
//
// Ограничение (documented, Reanimated docs §device/useReducedMotion): значение
// читается один раз при старте приложения и не обновляется, если пользователь
// меняет настройку не перезапуская приложение — это поведение самого Reanimated,
// не наша обёртка.
import { useReducedMotion as useReanimatedReducedMotion } from "react-native-reanimated";

/** true — пользователь включил «Уменьшение движения» в системе. */
export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}
