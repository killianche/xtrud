/**
 * «Создать задание» на Главной — главное действие приложения.
 *
 * Владелец, 2026-10-03: «с вау-эффектом»; 2026-10-06 (№247): «побольше,
 * потолще, ещё заметнее… очень качественный и дорогой дизайн». Решение — как
 * главные кнопки iOS 26 (App Store «Получить», Apple Pay) и Airbnb:
 *  - капсула 64 pt, крупный текст;
 *  - объёмная заливка: фирменный розовый, сверху светлее, снизу плотнее —
 *    наложением белого и чёрного из токенов, без новых цветов;
 *  - тонкая светлая кромка сверху — как у стекла iOS 26;
 *  - розовое свечение под кнопкой отделяет её от тёмного фото;
 *  - плюс в белом круге — якорь взгляда;
 *  - раз в несколько секунд — мягкий световой блик; нажатие — пружинистое
 *    сжатие и лёгкая вибрация. При «Уменьшении движения» блика и сжатия нет.
 * Отвергнуто: постоянная пульсация и бегущий градиент — дёшево и отвлекает.
 * Фото под кнопкой одинаково в обеих темах, поэтому и кнопка одинакова.
 */

import { LinearGradient } from "expo-linear-gradient";
import { Plus } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { darkColors, lightColors, withAlpha } from "@/lib/colors";
import { hapticImpact } from "@/lib/haptics";

/** Длительность прохода блика и пауза между проходами, мс. */
const SWEEP_MS = 1200;
const PAUSE_MS = 3200;
const HEIGHT = 64;
const CHIP = 36;

export function CreateTaskButton({ onPress }: { onPress: () => void }) {
  const reducedMotion = useReducedMotion();
  // Хексы палитры текущей темы: в вебе useThemeColor отдаёт CSS-переменную,
  // к ней не приписать прозрачность.
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const white = palette["on-dark"];
  const black = palette["surface-dark"];
  const accent = palette.accent;
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
      bounciness: 10,
    }).start();
  };

  const band = Math.max(90, width * 0.32);
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, width + band] });

  return (
    <Animated.View
      className="mt-5"
      style={{
        // Полное скругление, как у капсулы: на крупном шрифте она выше 64 pt.
        borderRadius: 999,
        transform: [{ scale }],
        // Свечение фирменного цвета, а не серая тень: кнопка «светится» над
        // тёмным фото.
        ...(Platform.OS === "web"
          ? { boxShadow: `0 12px 32px ${withAlpha(accent, 0.5)}` }
          : {
              shadowColor: accent,
              shadowOpacity: 0.55,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
              elevation: 10,
            }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Создать задание"
        onPress={() => {
          hapticImpact();
          onPress();
        }}
        onPressIn={() => pressTo(0.96)}
        onPressOut={() => pressTo(1)}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        className="flex-row items-center gap-3 overflow-hidden rounded-full bg-accent pl-3.5 pr-6 active:opacity-95"
        style={{
          minHeight: HEIGHT,
          // Светлая кромка сверху — как у стекла iOS 26.
          borderTopWidth: 1,
          borderTopColor: withAlpha(white, 0.45),
        }}
      >
        {/* Объём: сверху светлее, снизу плотнее. */}
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(white, 0.24), withAlpha(white, 0), withAlpha(black, 0.16)]}
          locations={[0, 0.5, 1]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
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
              colors={[withAlpha(white, 0), withAlpha(white, 0.38), withAlpha(white, 0)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : null}
        <View
          className="items-center justify-center rounded-full bg-on-dark"
          style={{ width: CHIP, height: CHIP }}
        >
          <Plus size={20} weight="bold" color={accent} />
        </View>
        <AppText weight="bold" className="flex-1 text-ios-title2 text-on-accent">
          Создать задание
        </AppText>
      </Pressable>
    </Animated.View>
  );
}
