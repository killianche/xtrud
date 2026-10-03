/**
 * «Создать задание» на Главной — главное действие приложения.
 *
 * Владелец, 2026-10-03: «кнопку „Создать задание“ — с вау-эффектом, какой-то
 * классный стильный эффект, анимация». Эффект сдержанный, в духе iOS: по
 * кнопке раз в несколько секунд проходит мягкий световой блик (как у
 * главных кнопок в магазинах приложений), нажатие — короткое пружинистое
 * сжатие. При «Уменьшении движения» блика и сжатия нет — обычная кнопка.
 * Цвет — фирменный розовый с белым текстом (владелец, 2026-10-01).
 */

import { LinearGradient } from "expo-linear-gradient";
import { Plus } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { darkColors, lightColors, withAlpha } from "@/lib/colors";
import { SHADOW_COLOR } from "@/lib/shadows";
import { useThemeColor } from "@/lib/use-theme-color";

/** Длительность прохода блика и пауза между проходами, мс. */
const SWEEP_MS = 1100;
const PAUSE_MS = 2600;

export function CreateTaskButton({ onPress }: { onPress: () => void }) {
  const onAccent = useThemeColor("on-accent");
  const reducedMotion = useReducedMotion();
  // Цвет блика — из палитры текущей темы (хекс: в вебе useThemeColor отдаёт
  // CSS-переменную, к ней не приписать прозрачность).
  const { colorScheme } = useColorScheme();
  const shine = (colorScheme === "dark" ? darkColors : lightColors)["on-dark"];
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion || width === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(PAUSE_MS),
        Animated.timing(sweep, {
          toValue: 1,
          duration: SWEEP_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, width, sweep]);

  const pressTo = (to: number) => {
    if (reducedMotion) return;
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 8,
    }).start();
  };

  const band = Math.max(80, width * 0.35);
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, width + band] });

  return (
    <Animated.View
      className="mt-4"
      style={{
        transform: [{ scale }],
        ...(Platform.OS === "web"
          ? { boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }
          : {
              shadowColor: SHADOW_COLOR,
              shadowOpacity: 0.18,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Создать задание"
        onPress={onPress}
        onPressIn={() => pressTo(0.97)}
        onPressOut={() => pressTo(1)}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        className="min-h-14 flex-row items-center gap-3 overflow-hidden rounded-2xl bg-accent px-5 active:opacity-90"
      >
        {!reducedMotion && width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: band,
              transform: [{ translateX }, { skewX: "-20deg" }],
            }}
          >
            <LinearGradient
              colors={[withAlpha(shine, 0), withAlpha(shine, 0.32), withAlpha(shine, 0)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : null}
        <View>
          <Plus size={22} weight="bold" color={onAccent} />
        </View>
        <AppText weight="semibold" className="flex-1 text-body-lg text-on-accent">
          Создать задание
        </AppText>
      </Pressable>
    </Animated.View>
  );
}
