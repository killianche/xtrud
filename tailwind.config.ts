import type { Config } from "tailwindcss";

// Tailwind/NativeWind конфиг xtrud — Vercel-based design tokens.
//
// Цвета — через CSS-переменные из global.css (поддержка alpha-modifier `text-ink/50`).
// Палитра — `src/lib/colors.ts`, генерируется в global.css скриптом `npm run tokens`.
//
// Шрифты:
//   - Geist (Vercel) — sans + display. Геометрический, оптимизирован для UI.
//   - Geist Mono — caption для метрик (рейтинг, цена, расстояние). xtrud override.
//   - Inter — fallback на native через @expo-google-fonts/inter.
//
// borderRadius:
//   - Vercel: pill (100px) для кнопок, md (8px) / lg (12px) для карточек.
//   - xtrud override: дефолт карточек 12px (теплее для consumer marketplace).
//
// Размеры шрифта — из DESIGN.md typography секции (Vercel + наши display-xl-tight).

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  // <html class="dark"> ставится inline theme-guard'ом в app/+html.tsx ДО hydration.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // === BASE ===
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        "canvas-soft": "rgb(var(--canvas-soft) / <alpha-value>)",
        "canvas-soft-2": "rgb(var(--canvas-soft-2) / <alpha-value>)",
        "surface-page": "rgb(var(--surface-page) / <alpha-value>)",
        "surface-card": "rgb(var(--surface-card) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        body: "rgb(var(--body) / <alpha-value>)",
        mute: "rgb(var(--mute) / <alpha-value>)",
        hairline: "rgb(var(--hairline) / <alpha-value>)",
        "hairline-strong": "rgb(var(--hairline-strong) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "on-primary": "rgb(var(--on-primary) / <alpha-value>)",

        // === LINK / ACCENT ===
        link: "rgb(var(--link) / <alpha-value>)",
        "link-deep": "rgb(var(--link-deep) / <alpha-value>)",
        "link-bg-soft": "rgb(var(--link-bg-soft) / <alpha-value>)",

        // === SEMANTIC ===
        success: "rgb(var(--success) / <alpha-value>)",
        "success-soft": "rgb(var(--success-soft) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        "warning-soft": "rgb(var(--warning-soft) / <alpha-value>)",
        "warning-deep": "rgb(var(--warning-deep) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        "error-soft": "rgb(var(--error-soft) / <alpha-value>)",
        "error-deep": "rgb(var(--error-deep) / <alpha-value>)",

        // === BRAND ACCENTS ===
        violet: "rgb(var(--violet) / <alpha-value>)",
        "violet-soft": "rgb(var(--violet-soft) / <alpha-value>)",
        "violet-deep": "rgb(var(--violet-deep) / <alpha-value>)",
        cyan: "rgb(var(--cyan) / <alpha-value>)",
        "cyan-soft": "rgb(var(--cyan-soft) / <alpha-value>)",
        "cyan-deep": "rgb(var(--cyan-deep) / <alpha-value>)",
        "highlight-pink": "rgb(var(--highlight-pink) / <alpha-value>)",
        "highlight-magenta": "rgb(var(--highlight-magenta) / <alpha-value>)",

        // === DARK SURFACES (CTA / коллажи) ===
        "surface-dark": "rgb(var(--surface-dark) / <alpha-value>)",
        "on-dark": "rgb(var(--on-dark) / <alpha-value>)",
        "on-dark-soft": "rgb(var(--on-dark-soft) / <alpha-value>)",

        // === BADGE PASTELS (Avatar seed-палитра) ===
        "badge-orange": "rgb(var(--badge-orange) / <alpha-value>)",
        "badge-pink": "rgb(var(--badge-pink) / <alpha-value>)",
        "badge-violet": "rgb(var(--badge-violet) / <alpha-value>)",
        "badge-emerald": "rgb(var(--badge-emerald) / <alpha-value>)",
        "badge-sky": "rgb(var(--badge-sky) / <alpha-value>)",
        "badge-amber": "rgb(var(--badge-amber) / <alpha-value>)",

        // === COMPAT ALIASES (legacy имена, удаляются после rewrite UI) ===
        "surface-1": "rgb(var(--surface-1) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
        "hairline-soft": "rgb(var(--hairline-soft) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-soft": "rgb(var(--muted-soft) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
      },
      fontSize: {
        // Шкала из Vercel DESIGN.md (typography:) + наши title-* (Vercel этих не имеет).
        // [fontSize, lineHeight] / третий элемент — letterSpacing если нужен.
        "display-xl": ["48px", { lineHeight: "48px", letterSpacing: "-2.4px" }],
        "display-lg": ["32px", { lineHeight: "40px", letterSpacing: "-1.28px" }],
        "display-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.96px" }],
        "display-sm": ["20px", { lineHeight: "28px", letterSpacing: "-0.6px" }],

        // title-* — наше расширение для секционных заголовков в Marketplace UI
        "title-lg": ["18px", { lineHeight: "24px", letterSpacing: "-0.3px" }],
        "title-md": ["16px", { lineHeight: "22px" }],

        // ios-* — метрики системных заголовков Apple (SF Pro), как в
        // приложениях iOS 26. DECISION владельца 2026-09-06: «заголовки
        // везде в стиле последнего iOS, один размер, один шрифт».
        //   Large Title — 34/41, tracking +0.37 (Bold)
        //   Title       — 17/22, tracking −0.41 (Semibold) — заголовок в
        //                 строке навигации, появляется при прокрутке.
        "ios-large-title": ["34px", { lineHeight: "41px", letterSpacing: "0.37px" }],
        "ios-title": ["17px", { lineHeight: "22px", letterSpacing: "-0.41px" }],
        //   Title 1     — 28/34, +0.36 (Bold) — заголовок шторки
        //   Title 2     — 22/28, +0.35 (Bold) — заголовок группы
        //   Body        — 17/22, −0.41 — строка списка, кнопка
        //   Callout     — 16/21, −0.32 — чипы, вторичные кнопки
        //   Subheadline — 15/20, −0.24 — подзаголовок, подпись под строкой
        //   Footnote    — 13/18, −0.08 — заголовок раздела списка, сноска
        "ios-title1": ["28px", { lineHeight: "34px", letterSpacing: "0.36px" }],
        "ios-title2": ["22px", { lineHeight: "28px", letterSpacing: "0.35px" }],
        "ios-body": ["17px", { lineHeight: "22px", letterSpacing: "-0.41px" }],
        "ios-callout": ["16px", { lineHeight: "21px", letterSpacing: "-0.32px" }],
        "ios-subheadline": ["15px", { lineHeight: "20px", letterSpacing: "-0.24px" }],
        "ios-footnote": ["13px", { lineHeight: "18px", letterSpacing: "-0.08px" }],

        // field-* — шрифт ПОЛЯ ВВОДА. Отличается от body-* ровно одним: у него
        // нет lineHeight. Так и должно быть: на iOS lineHeight у TextInput
        // ложится в paragraphStyle.maximumLineHeight, весь запас высоты уходит
        // НАД строкой, и текст в поле стоит ниже центра — владелец увидел это
        // на экране «Специалисты» 2026-09-04 («криво вписывается, не
        // центрировано»). Высоту строки в поле считает системный шрифт, а по
        // центру ставит контейнер.
        // Многострочному полю lineHeight, наоборот, нужен — там остаётся body-*.
        "field-lg": "18px",
        "field-md": "16px",

        "body-lg": ["18px", "28px"],
        "body-md": ["16px", "24px"],
        "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "-0.28px" }],
        caption: ["12px", "16px"],

        // mono — для цифр в карточках (рейтинг, цена, расстояние). xtrud override.
        // mono-md (16px) — для цен в листинге мастеров (фидбэк user 2026-05-14
        //                 «мелко, не читается», поднято с mono-body 14px).
        // mono-body (14px) — fallback / inline-цифры.
        // mono-sm (13px) — мета-цифры (рейтинг 4.9, расстояние 12км).
        // mono-caption (12px) — мелкие метки и не-критичные счётчики.
        "mono-md": ["16px", "24px"],
        "mono-body": ["14px", "20px"],
        "mono-sm": ["13px", "20px"],
        "mono-caption": ["12px", "16px"],

        button: ["14px", "20px"],
        "button-lg": ["16px", "24px"],
      },
      borderRadius: {
        // Vercel: pill 100 / md 8 / lg 12. xtrud дефолт карточек — lg (12px).
        none: "0px",
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px", // дефолт карточек (xtrud override)
        xl: "16px",
        "2xl": "20px",
        "pill-sm": "64px",
        pill: "100px",
        full: "9999px",
      },
      spacing: {
        // Vercel spacing scale (часть уже есть в Tailwind: 1=4, 2=8, …).
        // Добавляем только нестандартные.
        section: "192px", // hero band
      },
      screens: {
        // xs добавлен поверх дефолтных sm:640 / md:768 / lg:1024 / xl:1280 / 2xl:1536
        xs: "480px",
      },
      letterSpacing: {
        // Display tracking из Vercel (мы экспонируем как самостоятельные классы тоже)
        tightest: "-2.4px",
        tighter: "-1.28px",
        tight: "-0.96px",
        snug: "-0.6px",
      },
      fontFamily: {
        // Системный шрифт (с 2026-05-23): SF Pro (Apple) / Segoe (Windows) /
        // Roboto (Android). Ноль загрузки, мгновенный рендер. Заменил Geist,
        // который тянулся с внешнего CDN (jsdelivr) и грузился медленно.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Display = тот же системный sans (вес 600 задаётся в AppText/CSS).
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Mono для метрик в карточках — системный моноширинный.
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
