// Design tokens (non-color) для Expo iOS + Android + Web universal app.
//
// ВАЖНО: все значения в density-independent pixels (dp). На web ≈ CSS px при 100% zoom.
// Источники: CROSS_PLATFORM_RULES.md §2, DESIGN_SYSTEM.md §4-7.
//
// Цвета вынесены в `./colors.ts` и в `global.css` как CSS-переменные (поддержка alpha).
// Этот файл — только числовые и shape-токены. Импортируется в `tailwind.config.ts` и в коде.

/**
 * 4-dp grid spacing — стандарт Material + iOS HIG.
 * Никогда не используем кратные не 4. Tailwind мапит 1/2/3/4/5 на 4/8/12/16/20 по умолчанию.
 */
export const spacing = {
  px: 1,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16, // базовый padding контейнеров
  5: 20,
  6: 24, // section gap (mobile)
  7: 28,
  8: 32,
  10: 40,
  12: 48, // высота тач-таргета (touchTarget.min)
  14: 56,
  16: 64, // section gap (web)
  20: 80,
  24: 96,
  32: 128,
} as const;

/**
 * Шкала размеров шрифта (dp).
 * Минимум для body — 14 dp. body-md дефолт = 16 dp (соответствует Tailwind text-base).
 * См. CROSS_PLATFORM_RULES §1.2 + DESIGN_SYSTEM §4.2.
 */
export const fontSize = {
  // Tailwind-совместимые
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 28],
  xl: [20, 28],
  "2xl": [24, 32],
  "3xl": [30, 36],
  "4xl": [36, 40],
  // Display (DESIGN_SYSTEM §4.2)
  "display-sm": [24, 28],
  "display-md": [32, 38],
  "display-lg": [44, 48],
  "display-xl": [56, 60],
  // Title
  "title-lg": [20, 26],
  "title-md": [18, 25],
  "title-sm": [16, 22],
  // Body
  "body-lg": [17, 26],
  "body-md": [16, 24],
  "body-sm": [14, 21],
  // Misc
  caption: [13, 18],
  "caption-xs": [12, 16],
  button: [15, 20],
  nav: [14, 20],
} as const;

/**
 * Веса шрифта — имена соответствуют Inter Google Font вариантам.
 */
export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

/**
 * Border-radius (dp).
 * Согласно DESIGN_SYSTEM §6, `xl` (20) — сигнатурный для category-tile.
 */
export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10, // кнопки, инпуты
  lg: 14, // контентные карточки
  xl: 20, // category-tile, hero
  "2xl": 28, // bottom sheets, крупные модалки
  pill: 9999, // бейджи, sub-nav
  full: 9999, // аватары
} as const;

/**
 * Минимум тач-таргета (dp). Для ЦА 30-60 лет важно.
 * CROSS_PLATFORM_RULES §6 + WCAG 2.5.5.
 */
export const touchTarget = {
  min: 48,
  comfortable: 56,
} as const;

/**
 * Брейкпойнты (px на web). На native — через useWindowDimensions.
 * CROSS_PLATFORM_RULES §15 + расширение xs из DESIGN_SYSTEM §10.
 */
export const breakpoints = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1440,
} as const;

/**
 * z-index слои.
 */
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  modal: 50,
  toast: 100,
} as const;

/**
 * Длительности анимаций (ms). Короче 150 — дёрганно, длиннее 400 — медленно.
 */
export const animation = {
  fast: 150,
  normal: 220,
  slow: 320,
} as const;

/**
 * Тени. На iOS — нативные shadowColor/Offset/Opacity/Radius.
 * На Android — elevation (см. CROSS_PLATFORM_RULES §4: shadow-* в NativeWind не даёт elevation).
 * На web — конвертится в box-shadow автоматически NativeWind.
 *
 * Использование: применять прямым style={shadow.md} или через NativeWind кастомные классы.
 */
export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export type Spacing = keyof typeof spacing;
export type FontSize = keyof typeof fontSize;
export type Radius = keyof typeof radius;
export type Breakpoint = keyof typeof breakpoints;
