// Хук для работы с цветовой схемой.
// Объединяет:
//   - NativeWind useColorScheme (резолвит в `light`|`dark` и применяет `.dark` класс на html)
//   - пользовательское предпочтение из useThemeStore (`system` | `light` | `dark`)
//
// Использование:
//   const { colorScheme, preference, setPreference } = useColorScheme();
//   <Pressable onPress={() => setPreference(colorScheme === 'dark' ? 'light' : 'dark')}/>
//
// При первом рендере применяет preference к NativeWind через useEffect.

import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import { useEffect } from "react";
import { useThemeStore } from "@/lib/theme";

export function useColorScheme() {
  const { colorScheme, setColorScheme } = useNativeWindColorScheme();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  useEffect(() => {
    // NativeWind принимает 'light' | 'dark' | 'system'
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  return {
    /** Резолвленная схема: 'light' | 'dark' (null до первого рендера на web SSR). */
    colorScheme,
    /** Что выбрал пользователь: 'system' | 'light' | 'dark'. */
    preference,
    /** Сменить предпочтение пользователя. */
    setPreference,
  };
}
