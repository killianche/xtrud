/**
 * XtrudWordmark — фирменный wordmark: SVG-знак + текст «xtrud» справа.
 *
 * Используется в шапках страниц для усиления узнаваемости бренда. Версия 2
 * (2026-05-20): пользователь вернул wordmark в левый угол TopBar главной
 * после короткого эксперимента с центрированным вариантом.
 *
 * Поведение:
 *   - Mark (SVG) слева, text справа, gap 8px.
 *   - Текст «xtrud» — системный bold (через AppText weight="bold"), размер
 *     синхронизирован с size mark'а (примерно size * 0.75 — визуальный
 *     центр выровнен с центром mark'а).
 *   - Цвет text = цвет mark = ink (theme-aware) по умолчанию. ВАЖНО: цвет
 *     текста по умолчанию задаём className `text-ink`, а НЕ инлайн
 *     `color={useThemeColor("ink")}` — на web ink резолвится в `rgb(var(--ink))`,
 *     и react-native-web роняет такой CSS-var-цвет в инлайн-стиле текста
 *     (текст становился чёрным в dark, баг 2026-05-24). Для SVG-знака
 *     `rgb(var(--ink))` работает, поэтому mark красим им как раньше.
 *
 * API:
 *   <XtrudWordmark />                  // size=28 default, ink theme color
 *   <XtrudWordmark size={26} />        // компактный, для шапки
 *   <XtrudWordmark color="#fff" />     // на тёмном фоне (override)
 */

import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { XtrudLogo } from "@/components/XtrudLogo";
import { useThemeColor } from "@/lib/use-theme-color";

interface XtrudWordmarkProps {
  /** Размер mark'а (квадрат). Default 28. Текст масштабируется пропорционально. */
  size?: number;
  /** Override цвета mark'а и текста. По умолчанию — ink (theme-aware). */
  color?: string;
}

export function XtrudWordmark({ size = 28, color }: XtrudWordmarkProps) {
  const ink = useThemeColor("ink");
  const resolvedColor = color ?? ink;
  const fontSize = Math.round(size * 0.75);

  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <XtrudLogo size={size} color={resolvedColor} />
      <AppText
        weight="bold"
        // По умолчанию (нет override) цвет текста — через className text-ink:
        // на web он становится белым в dark корректно. Инлайн rgb(var(--ink))
        // RNW для текста роняет (см. шапку). При override (color="#fff" на фото) —
        // инлайн-hex парсится нормально.
        className={color ? undefined : "text-ink"}
        style={{
          fontSize,
          lineHeight: fontSize * 1.15,
          letterSpacing: -0.5,
          ...(color ? { color } : null),
        }}
      >
        xtrud
      </AppText>
    </View>
  );
}
