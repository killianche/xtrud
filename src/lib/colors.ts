// Цветовая палитра xtrud — light + dark темы.
//
// ИСТОЧНИК ИСТИНЫ — этот файл. Значения зеркалятся в global.css как CSS-переменные
// (формат `--name: R G B` для поддержки alpha через `rgb(var(--name) / <alpha-value>)` в Tailwind).
//
// WCAG-фиксы относительно DESIGN_SYSTEM.md §3 (зафиксировано в STATUS.md):
// - light/muted-soft: #9ca3af → #71717a (zinc-500). Контраст на #ffffff: 2.95:1 → 4.61:1 ✅ AA
// - light/accent:    #3b82f6 → #2563eb (blue-600). Контраст на #ffffff: 3.7:1 → 5.6:1 ✅ AA body
// - dark/accent оставлен #3b82f6 (на #0a0a0a контраст 5.7:1 ✅)
// - dark/muted-soft #71717a borderline (4.2:1) — допустимо для caption.

export const lightColors = {
  // Фоны и поверхности
  canvas: "#ffffff",
  "surface-1": "#fafafa",
  "surface-2": "#f5f5f5",
  "surface-3": "#e5e7eb",
  "surface-dark": "#0a0a0a", // для тёмных категорийных плиток и футера

  // Линии
  hairline: "#e5e7eb",
  "hairline-soft": "#f3f4f6",

  // Текст
  ink: "#0a0a0a",
  body: "#374151",
  muted: "#6b7280",
  "muted-soft": "#71717a", // WCAG-fix

  // Текст на dark-карточках/CTA
  "on-primary": "#ffffff",
  "on-dark": "#ffffff",
  "on-dark-soft": "#a1a1aa",

  // Брендовые
  primary: "#0a0a0a", // primary CTA на light — почти-чёрный
  accent: "#2563eb", // WCAG-fix (был #3b82f6)
  "accent-soft": "#dbeafe", // фон info-баннеров, selected чипа

  // Semantic
  success: "#10b981",
  "success-soft": "#d1fae5",
  warning: "#f59e0b",
  "warning-soft": "#fef3c7",
  error: "#ef4444",
  "error-soft": "#fee2e2",

  // Badge / avatar пастели
  "badge-orange": "#fb923c",
  "badge-pink": "#ec4899",
  "badge-violet": "#8b5cf6",
  "badge-emerald": "#34d399",
  "badge-sky": "#38bdf8",
  "badge-amber": "#fbbf24",
} as const;

export const darkColors = {
  canvas: "#0a0a0a",
  "surface-1": "#111111",
  "surface-2": "#171717",
  "surface-3": "#262626",
  "surface-dark": "#0a0a0a",

  hairline: "#262626",
  "hairline-soft": "#1f1f1f",

  ink: "#fafafa",
  body: "#d4d4d8",
  muted: "#a1a1aa",
  "muted-soft": "#71717a",

  "on-primary": "#0a0a0a", // primary CTA в dark = светлая, текст тёмный
  "on-dark": "#ffffff",
  "on-dark-soft": "#a1a1aa",

  primary: "#fafafa", // primary CTA в dark — почти-белый
  accent: "#3b82f6", // на чёрном работает (5.7:1)
  "accent-soft": "#1e3a8a",

  success: "#10b981",
  "success-soft": "#064e3b",
  warning: "#f59e0b",
  "warning-soft": "#78350f",
  error: "#ef4444",
  "error-soft": "#7f1d1d",

  "badge-orange": "#fb923c",
  "badge-pink": "#ec4899",
  "badge-violet": "#8b5cf6",
  "badge-emerald": "#34d399",
  "badge-sky": "#38bdf8",
  "badge-amber": "#fbbf24",
} as const;

export type ColorToken = keyof typeof lightColors;

/**
 * Утилита для конвертации hex → "R G B" триплет для CSS-переменных.
 * Используется при ручной генерации global.css из этой палитры, если палитра изменится.
 */
export function hexToRgbTriplet(hex: string): string {
  const cleaned = hex.replace("#", "");
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
