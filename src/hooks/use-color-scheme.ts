// Тема: один источник истины, один путь резолва.
//
// Архитектура:
//   - Источник истины — Zustand store `useThemeStore` (ключ "xtrud-theme" в storage).
//   - На web SSR-flash убирается inline theme-guard в `app/+html.tsx` (ставит class="dark"
//     на <html> ДО первого рендера, читая тот же localStorage ключ).
//   - JS-резолв для useThemeColor / useThemeColors — этот хук.
//
// КОРНЕВАЯ ПРОБЛЕМА которую решаем:
//   На web на первом рендере React 18 SSR + hydration работает так:
//   - SSR не имеет доступа к localStorage → useThemeStore возвращает default 'system'
//   - matchMedia на сервере отсутствует → 'system' резолвится в 'light'
//   - Клиент гидрируется с ТАКИМ ЖЕ значением, чтобы избежать hydration mismatch warning
//   - Zustand persist rehydrate происходит ПОСЛЕ первого рендера → preference обновляется
//   - Но JS-цвета (Lucide иконки, inline style.color) уже захвачены с неправильной палитры
//
// РЕШЕНИЕ:
//   На web НЕ ИСПОЛЬЗУЕМ Zustand. Читаем localStorage синхронно при каждом рендере.
//   Это сахар-неэлегантно, но даёт корректное значение начиная с первого рендера.
//   Хук всё равно подписан на useThemeStore чтобы тригерить re-render при смене preference.
//
//   На native localStorage нет — используем Zustand preference (он гидрируется через
//   SecureStore, который тоже async, но NativeWind colorScheme через RN Appearance даёт
//   правильное значение синхронно).

import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import { useEffect } from "react";
import { Platform } from "react-native";
import { type ThemePreference, useThemeStore } from "@/lib/theme";

/** Синхронно читает preference из localStorage (web only). Возвращает null если нет/ошибка. */
function readStoredPreferenceWeb(): ThemePreference | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("xtrud-theme");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const pref = parsed?.state?.preference;
    if (pref === "system" || pref === "light" || pref === "dark") return pref;
    return null;
  } catch {
    return null;
  }
}

function resolveSystemSchemeWeb(): "dark" | "light" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function resolveScheme(preference: ThemePreference): "dark" | "light" {
  if (preference === "dark" || preference === "light") return preference;
  return resolveSystemSchemeWeb();
}

export function useColorScheme() {
  const { colorScheme: nwScheme, setColorScheme } = useNativeWindColorScheme();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  // Синхронизируем NativeWind с preference. Нужно для Tailwind `dark:` префиксов.
  useEffect(() => {
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  // На web: читаем localStorage синхронно — обходит async hydration Zustand persist.
  // На native: используем NativeWind colorScheme (RN Appearance даёт sync ответ).
  let colorScheme: "light" | "dark";
  if (Platform.OS === "web") {
    const stored = readStoredPreferenceWeb();
    const effectivePref = stored ?? preference;
    colorScheme = resolveScheme(effectivePref);
  } else {
    colorScheme =
      nwScheme === "dark" || nwScheme === "light" ? nwScheme : resolveScheme(preference);
  }

  return {
    /** Резолвленная схема: 'light' | 'dark'. */
    colorScheme,
    /** Что выбрал пользователь: 'system' | 'light' | 'dark'. */
    preference,
    /** Сменить предпочтение пользователя. */
    setPreference,
  };
}
