// Хук для работы с цветовой схемой — единственная точка резолва темы.
//
// Объединяет:
//   - NativeWind useColorScheme (резолвит в `light` | `dark` и применяет `.dark` класс на html)
//   - пользовательское предпочтение из useThemeStore (`system` | `light` | `dark`)
//
// На web SSR-flash устранён inline theme-guard в `app/+html.tsx` — он ставит
// класс `dark` на <html> ДО первого рендера, читая Zustand persist напрямую.
// Так что CSS-переменные правильно резолвятся уже на первом пейнте.
//
// JS-резолв (для Lucide-иконок, placeholderTextColor) на первом рендере:
//   - если NativeWind уже вернул light|dark — берём его
//   - иначе резолвим preference сами: 'light'|'dark' напрямую, 'system' → matchMedia (web)
//   На native NativeWind резолвит сразу, фолбэк не нужен.
//
// Использование:
//   const { colorScheme, preference, setPreference } = useColorScheme();

import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useThemeStore, type ThemePreference } from "@/lib/theme";

function resolveSystemScheme(): "dark" | "light" {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function resolvePreference(preference: ThemePreference): "dark" | "light" {
  if (preference === "dark" || preference === "light") return preference;
  return resolveSystemScheme();
}

export function useColorScheme() {
  const { colorScheme: nwScheme, setColorScheme } = useNativeWindColorScheme();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  useEffect(() => {
    // NativeWind принимает 'light' | 'dark' | 'system'. На 'system' она сама
    // подписывается на matchMedia (web) / Appearance (native) и обновляет класс.
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  // На web NativeWind на первом рендере возвращает Appearance.getColorScheme(),
  // которое не знает про наш preference из store. Резолвим сами из store, чтобы
  // JS-цвета (Lucide иконки и т.д.) совпадали с inline theme-guard'ом из +html.tsx.
  // На native NativeWind работает корректно через RN Appearance, ему доверяем.
  const colorScheme: "light" | "dark" =
    Platform.OS === "web" ? resolvePreference(preference) : (nwScheme ?? resolvePreference(preference));

  return {
    /** Резолвленная схема: 'light' | 'dark'. */
    colorScheme,
    /** Что выбрал пользователь: 'system' | 'light' | 'dark'. */
    preference,
    /** Сменить предпочтение пользователя. */
    setPreference,
  };
}
