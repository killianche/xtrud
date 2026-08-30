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
import { useEffect, useSyncExternalStore } from "react";
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

/**
 * Источник истины на web: фактический класс `<html>`.
 *
 * `+html.tsx` ставит `.dark` на `<html>` ДО первого React-рендера (theme-guard
 * скрипт). NativeWind после гидрации тоже модифицирует этот класс. Это гарантирует
 * что CSS-vars `rgb(var(--canvas))` зарезолвлены в нужной палитре.
 *
 * `Modal` на react-native-web рендерится в portal — теоретически вне React-дерева.
 * Но `.dark` на `<html>` — корень всего DOM, и CSS-vars наследуются вниз через каскад.
 * Поэтому inline-цвета (hex из darkColors/lightColors) должны соответствовать именно
 * фактическому `<html class>`, не Zustand preference (он может быть в hydration race).
 *
 * Hook читает класс синхронно через `useSyncExternalStore` + MutationObserver — это
 * tear-free для React 18 concurrent rendering.
 */
function subscribeToHtmlClass(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getHtmlColorScheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerHtmlColorScheme(): "light" | "dark" {
  return "light";
}

/**
 * Резолвит colorScheme на web из фактического класса `<html>` — единственный
 * корректный источник истины для inline-стилей в portal'ах (Modal, popover).
 *
 * Не использовать на native — там Appearance API через NativeWind.
 */
export function useDomColorScheme(): "light" | "dark" {
  return useSyncExternalStore(subscribeToHtmlClass, getHtmlColorScheme, getServerHtmlColorScheme);
}

export function useColorScheme() {
  const { colorScheme: nwScheme, setColorScheme } = useNativeWindColorScheme();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

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

  // Синхронизируем NativeWind с preference. На native передаём preference как
  // есть (включая "system") — NativeWind использует RN Appearance автоматически.
  // На web передаём РЕЗОЛВЛЕННОЕ light/dark, потому что NativeWind на web не
  // подхватывает matchMedia при setColorScheme("system") (баг до 2026-05-27:
  // на web preference="system" + система=dark → NativeWind ставил light).
  useEffect(() => {
    if (Platform.OS === "web") {
      setColorScheme(colorScheme);
    } else {
      setColorScheme(preference);
    }
  }, [preference, colorScheme, setColorScheme]);

  // На web — слушаем смену системной темы для preference="system". Без этого
  // если пользователь сменит системную тёмную в OS пока приложение открыто,
  // оно не отреагирует до перезагрузки.
  useEffect(() => {
    if (Platform.OS !== "web" || preference !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Triggerим re-render через no-op state update — colorScheme вычислится
      // заново через resolveSystemSchemeWeb на следующем рендере.
      setColorScheme(mql.matches ? "dark" : "light");
    };
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, [preference, setColorScheme]);

  return {
    /** Резолвленная схема: 'light' | 'dark'. */
    colorScheme,
    /** Что выбрал пользователь: 'system' | 'light' | 'dark'. */
    preference,
    /** Сменить предпочтение пользователя. */
    setPreference,
  };
}
