/**
 * Размытие у верхнего края при прокрутке — как scroll edge effect в iOS 26.
 *
 * Владелец, 2026-10-03 (скриншот «Найти задание»): компактный заголовок висел
 * прямо поверх карточек и капсул, текст наезжал на текст. В iOS 26 у панелей
 * нет плашки: содержимое под ними размывается и плавно растворяется в цвет
 * фона. Здесь то же самое без маски: сплошной блюр до низа панели, ниже —
 * ступени блюра со снижающейся силой и заливка цветом фона, сходящая на нет
 * за `fade` pt. Маска (@react-native-masked-view) не используется: у неё нет
 * компонента для новой архитектуры RN (QA 2026-10-03), а expo-blur — модуль
 * Expo и работает на ней штатно.
 *
 * Слой декоративный: касания проходят насквозь, VoiceOver его не видит.
 */

import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { darkColors, lightColors } from "@/lib/colors";

/** На сколько pt ниже панели размытие сходит на нет. */
export const EDGE_FADE = 28;

/** Сила блюра ступеней растворения, сверху вниз. */
const FADE_STEPS = [44, 30, 18, 8] as const;
const BODY_INTENSITY = 60;

/** «#rrggbb» → «rgba(r,g,b,a)». Для токенов-хексов; иное возвращаем как есть. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return color;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h as string, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ScrollEdgeEffect({ fade = EDGE_FADE }: { fade?: number }) {
  const { colorScheme } = useColorScheme();
  // Хекс из палитры, а не useThemeColor: в вебе тот отдаёт CSS-переменную,
  // к которой нельзя добавить прозрачность.
  const page = (colorScheme === "dark" ? darkColors : lightColors)["surface-page"];
  const ios = Platform.OS === "ios";
  const tint = colorScheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterialLight";
  // Без системного блюра (Android, веб) читаемость держит одна заливка.
  const bodyAlpha = ios ? 0.6 : 0.94;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1 }}>
        {ios ? <BlurView intensity={BODY_INTENSITY} tint={tint} style={{ flex: 1 }} /> : null}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: withAlpha(page, bodyAlpha),
          }}
        />
      </View>
      <View style={{ height: fade }}>
        {ios
          ? FADE_STEPS.map((intensity) => (
              <BlurView key={intensity} intensity={intensity} tint={tint} style={{ flex: 1 }} />
            ))
          : null}
        <LinearGradient
          colors={[withAlpha(page, bodyAlpha), withAlpha(page, 0)]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      </View>
    </View>
  );
}
