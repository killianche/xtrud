/**
 * Фокус поля — после того как экран доехал, а не во время перехода.
 *
 * Владелец, 2026-10-03 (скриншот «Что нужно сделать?»): клавиатура
 * появлялась вместе с въезжающим экраном серой и только потом светлела.
 * Клавиатура iOS 26 полупрозрачна и во время перехода просвечивает сквозь
 * его затемнение. autoFocus поднимал её сразу; теперь фокус ставится по
 * событию стека transitionEnd (запасной таймер — если события нет).
 */

import { useNavigation } from "expo-router";
import { type RefObject, useEffect } from "react";
import type { TextInput } from "react-native";

/** Дольше стандартного перехода iOS (~350 мс). */
const FALLBACK_MS = 600;

export function useFocusAfterTransition(ref: RefObject<TextInput | null>, enabled: boolean): void {
  const navigation = useNavigation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: только при входе на экран.
  useEffect(() => {
    if (!enabled) return;
    let done = false;
    const focus = () => {
      if (done) return;
      done = true;
      ref.current?.focus();
    };
    const unsubscribe = navigation.addListener(
      "transitionEnd" as never,
      ((e: { data?: { closing?: boolean } }) => {
        if (!e.data?.closing) focus();
      }) as never,
    );
    const timer = setTimeout(focus, FALLBACK_MS);
    return () => {
      done = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
