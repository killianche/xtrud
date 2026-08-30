// AppText — обёртка над `<Text>` с правильным шрифтом + Dynamic Type фиксом.
//
// Шрифт — СИСТЕМНЫЙ (с 2026-05-23, по решению владельца «супер стандартный и
// везде быстро открывающийся»). Ноль загрузки → мгновенный рендер, без флэша
// и без зависимости от внешнего CDN:
//   - iOS / macOS / Safari → San Francisco (SF Pro)
//   - Windows-браузер      → Segoe UI
//   - Android              → Roboto
// Раньше был Geist (Vercel), который на web тянулся с jsdelivr и грузился медленно.
//
// На web:    fontFamily = системный sans-стек, нужный вес через число fontWeight.
// На native: НЕ задаём fontFamily — это и есть системный шрифт устройства;
//            вес задаём числом (RN сам выбирает SF/Roboto нужной толщины).
//
// `weight="display"` — исторический prop для крупных заголовков (semibold 600).
//
// `weight="mono"` — для метрик (★ 4.9, цена, расстояние, дата). С 2026-05-24
// это БОЛЬШЕ НЕ моноширинный шрифт (владельцу он казался «старым/техничным») —
// теперь обычный системный шрифт + ТАБЛИЧНЫЕ цифры (`fontVariant: tabular-nums`):
// цифры одной ширины, колонки цен/дат остаются ровными, но вид современный.

import { forwardRef } from "react";
import { Platform, Text, type TextProps, type TextStyle } from "react-native";

export type AppTextWeight = "regular" | "medium" | "semibold" | "bold" | "display" | "mono";

const fontWeightMap: Record<AppTextWeight, "400" | "500" | "600" | "700"> = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  display: "600",
  mono: "500",
};

// Системный шрифтовый стек (web). Первым идёт SF Pro (Apple), затем Segoe
// (Windows) и Roboto (Android) — у всех есть все нужные веса.
const WEB_SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Helvetica Neue", Arial, sans-serif';

// Табличные цифры для метрик (вместо моноширинного шрифта): цифры одной ширины
// → ровные колонки цен/дат, но обычный современный шрифт.
const TABULAR_NUMS: TextStyle = { fontVariant: ["tabular-nums"] };

export interface AppTextProps extends TextProps {
  weight?: AppTextWeight;
}

export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  { weight = "regular", style, ...props },
  ref,
) {
  const fontWeight = fontWeightMap[weight] as "400";

  // На web задаём системный sans явно; на native пустой fontFamily = системный.
  const baseStyle = Platform.OS === "web" ? { fontFamily: WEB_SANS, fontWeight } : { fontWeight };

  return (
    <Text
      ref={ref}
      maxFontSizeMultiplier={1.3}
      style={[baseStyle, weight === "mono" ? TABULAR_NUMS : null, style]}
      {...props}
    />
  );
});
