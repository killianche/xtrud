// Цветовая палитра xtrud — Vercel-based light + dark.
//
// ИСТОЧНИК ИСТИНЫ — этот файл. CSS-переменные в global.css генерируются
// автоматически: `npm run tokens`. Не редактируй global.css руками.
//
// Структура:
//   1. Base — основные токены из Vercel DESIGN.md (canvas/ink/body/hairline/primary/...).
//   2. Semantic — success/warning/error (Vercel в этом dev-tool, у нас marketplace).
//   3. Brand accents — link/violet/cyan/highlight-pink из Vercel.
//   4. Badge pastels — для Avatar fallback с seed-цветом.
//   5. Compat aliases — старые имена (surface-2, muted, accent, …) маппятся в новые,
//      чтобы не ломать ещё не переписанные экраны. Удаляются после rewrite-фазы.
//
// Dark theme — наша интерпретация, в Vercel DESIGN.md только light.
// Логика: инвертируем canvas/ink/primary, смягчаем link/semantic для контраста на чёрном.

export const lightColors = {
  // === BASE (из Vercel DESIGN.md) ===
  canvas: "#ffffff",
  "canvas-soft": "#fafafa",
  "canvas-soft-2": "#f5f5f5",
  // Пара поверхностей для списков карточек (DECISION владельца 2026-09-04:
  // «карточка обведена, но линия не видна»). Раньше карточка была `canvas`
  // на фоне `canvas` — белое на белом, и всё держалось на линии #ebebeb с
  // контрастом 8%: на телефоне при свете она исчезала.
  //
  // Теперь фон списка чуть темнее карточки. В тёмной теме соотношение
  // обратное — приподнятая поверхность светлее фона, как и положено.
  "surface-page": "#f2f2f7", // systemGroupedBackground iOS: карточки читаются без обводок
  "surface-card": "#ffffff",
  ink: "#171717",
  body: "#4d4d4d",
  mute: "#888888",
  hairline: "#ebebeb",
  "hairline-strong": "#a1a1a1",
  primary: "#171717",
  "on-primary": "#ffffff",

  // === LINK / ACCENT ===
  link: "#0070f3",
  "link-deep": "#0761d1",
  "link-bg-soft": "#d3e5ff",

  // === SEMANTIC (наше расширение) ===
  success: "#10b981",
  "success-soft": "#d1fae5",
  warning: "#f5a623",
  "warning-soft": "#ffefcf",
  "warning-deep": "#ab570a",
  error: "#ee0000",
  "error-soft": "#f7d4d6",
  "error-deep": "#c50000",

  // === BRAND ACCENTS (из Vercel) ===
  violet: "#7928ca",
  "violet-soft": "#d8ccf1",
  "violet-deep": "#4c2889",
  cyan: "#50e3c2",
  "cyan-soft": "#aaffec",
  "cyan-deep": "#29bc9b",
  "highlight-pink": "#ff0080",
  "highlight-magenta": "#eb367f",

  // === DARK SURFACES (для тёмных CTA / коллажей на light-теме) ===
  "surface-dark": "#0a0a0a",
  "on-dark": "#ffffff",
  "on-dark-soft": "#a1a1a1",

  // === BADGE PASTELS (Avatar seed-палитра) ===
  "badge-orange": "#fb923c",
  "badge-pink": "#ec4899",
  "badge-violet": "#8b5cf6",
  "badge-emerald": "#34d399",
  "badge-sky": "#38bdf8",
  "badge-amber": "#fbbf24",

  // === COMPAT ALIASES (старые имена, удаляются после rewrite) ===
  "surface-1": "#fafafa", // = canvas-soft
  "surface-2": "#f5f5f5", // = canvas-soft-2
  "surface-3": "#ebebeb", // = hairline
  "hairline-soft": "#f5f5f5", // = canvas-soft-2
  muted: "#888888", // = mute
  "muted-soft": "#a1a1a1", // = hairline-strong
  // Фирменный accent xtrud — розово-красный (решение владельца 2026-05-27).
  // Раньше был синий #0070f3 (= link). Теперь акцент = бренд-цвет логотипа.
  // link остаётся отдельным синим токеном для текстовых гиперссылок.
  // Затемнён 2026-09-03 (DECISION владельца): с белым контентом даёт 4.7:1 —
  // AA для текста кнопки. Прежний #fe5574 давал с белым 3.1:1.
  accent: "#e11d48", // бренд розово-красный
  "accent-soft": "#ffe4ea", // бледно-розовый фон для chip/badge
  // Текст и иконки на акцентной заливке — БЕЛЫЕ в обеих темах.
  //
  // DECISION владельца 2026-09-03: «на розовых кнопках нужен белый контент»,
  // а сам акцент затемнён до #e11d48, чтобы белый прошёл AA. Итог: белый на
  // акценте — 4.7:1 в обеих темах (норма для текста кнопки 4.5:1).
  "on-accent": "#ffffff",
} as const;

export const darkColors = {
  // === BASE (инверсия light) ===
  // Контраст подкачали 2026-05-14 по фидбэку user «в тёмной теме ничего не
  // видно». Было: mute #6b, hairline #26, canvas-soft #11. На canvas #0a текст
  // secondary тонул в фоне, бордеры outline-кнопок не различались.
  // WCAG AA target для secondary text ≥ 4.5:1. Подняли все «middle» оттенки.
  canvas: "#0a0a0a",
  "canvas-soft": "#161616", // 11 → 16 (различим от canvas)
  "canvas-soft-2": "#222222", // 1a → 22 (card-row отделяется от фона)
  // Здесь пара инвертирована: страница — самый тёмный слой, карточка светлее.
  "surface-page": "#0a0a0a",
  "surface-card": "#161616",
  ink: "#fafafa",
  body: "#b8b8b8", // a1 → b8 (description-text легче читать)
  mute: "#999999", // 6b → 99 (мета «13 лет опыта», «Назрань»)
  hairline: "#333333", // 26 → 33 (видимая граница строк/карточек)
  "hairline-strong": "#525252", // 40 → 52 (outline-кнопки Позвонить/WhatsApp)
  primary: "#fafafa",
  "on-primary": "#0a0a0a",

  // === LINK / ACCENT (светлее на чёрном для контраста) ===
  link: "#3291ff",
  "link-deep": "#5599ff",
  "link-bg-soft": "#1a3a5c",

  // === SEMANTIC ===
  success: "#34d399",
  "success-soft": "#064e3b",
  warning: "#fbbf24",
  "warning-soft": "#78350f",
  "warning-deep": "#fde68a",
  error: "#ef4444",
  "error-soft": "#7f1d1d",
  "error-deep": "#fca5a5",

  // === BRAND ACCENTS ===
  violet: "#a78bfa",
  "violet-soft": "#4c2889",
  "violet-deep": "#ddd6fe",
  cyan: "#67e8f9",
  "cyan-soft": "#155e75",
  "cyan-deep": "#a5f3fc",
  "highlight-pink": "#ff4da6",
  "highlight-magenta": "#f472b6",

  // === DARK SURFACES (на dark = тот же canvas) ===
  "surface-dark": "#0a0a0a",
  "on-dark": "#ffffff",
  "on-dark-soft": "#a1a1a1",

  // === BADGE PASTELS ===
  "badge-orange": "#fb923c",
  "badge-pink": "#ec4899",
  "badge-violet": "#8b5cf6",
  "badge-emerald": "#34d399",
  "badge-sky": "#38bdf8",
  "badge-amber": "#fbbf24",

  // === COMPAT ALIASES ===
  // Синхронизированы с base-токенами выше (canvas-soft / canvas-soft-2 /
  // hairline / mute / hairline-strong подняты для контраста 2026-05-14).
  "surface-1": "#161616", // = canvas-soft
  "surface-2": "#222222", // = canvas-soft-2
  "surface-3": "#333333", // = hairline
  "hairline-soft": "#1f1f1f",
  muted: "#999999", // = mute
  "muted-soft": "#525252", // = hairline-strong
  // Тот же затемнённый акцент, что и в светлой теме (DECISION владельца
  // 2026-09-03: «обе темы»). Компромисс назван честно: белый на заливке —
  // 4.7:1 (было 2.7:1 у прежнего #ff6b87), но сам акцент как ТЕКСТ на тёмном
  // canvas даёт 4.2:1 вместо прежних 7.3:1. Одного цвета, проходящего AA и
  // как заливка под белым, и как текст на #0a0a0a, не существует: первое
  // требует яркости ≤0.183, второе ≥0.189. Приоритет отдан кнопке — её
  // владелец и смотрел на устройстве.
  accent: "#e11d48",
  "accent-soft": "#4a1f29", // тёмно-розовый приглушённый фон
  "on-accent": "#ffffff", // см. светлую тему: белый на акценте в обеих (DECISION 2026-09-03)
} as const;

export type ColorToken = keyof typeof lightColors;

/**
 * Утилита для конвертации hex → "R G B" триплет для CSS-переменных.
 * Используется в scripts/generate-css-tokens.mjs.
 */
export function hexToRgbTriplet(hex: string): string {
  const cleaned = hex.replace("#", "");
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
