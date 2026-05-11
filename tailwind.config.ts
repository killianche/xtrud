import type { Config } from "tailwindcss";

// Tailwind/NativeWind конфиг с дизайн-токенами xtrud.
//
// Цвета — через CSS-переменные из global.css (поддержка alpha).
// Размеры шрифта и радиусы — из DESIGN_SYSTEM.md §4-6 и CROSS_PLATFORM_RULES.md §2.

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Класс-стратегия: <html class="dark"> или <View className="dark"> на root.
  // Управляется через NativeWind useColorScheme + useThemeStore.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        "surface-1": "rgb(var(--surface-1) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
        "surface-dark": "rgb(var(--surface-dark) / <alpha-value>)",

        hairline: "rgb(var(--hairline) / <alpha-value>)",
        "hairline-soft": "rgb(var(--hairline-soft) / <alpha-value>)",

        ink: "rgb(var(--ink) / <alpha-value>)",
        body: "rgb(var(--body) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-soft": "rgb(var(--muted-soft) / <alpha-value>)",

        "on-primary": "rgb(var(--on-primary) / <alpha-value>)",
        "on-dark": "rgb(var(--on-dark) / <alpha-value>)",
        "on-dark-soft": "rgb(var(--on-dark-soft) / <alpha-value>)",

        primary: "rgb(var(--primary) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",

        success: "rgb(var(--success) / <alpha-value>)",
        "success-soft": "rgb(var(--success-soft) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        "warning-soft": "rgb(var(--warning-soft) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        "error-soft": "rgb(var(--error-soft) / <alpha-value>)",

        "badge-orange": "rgb(var(--badge-orange) / <alpha-value>)",
        "badge-pink": "rgb(var(--badge-pink) / <alpha-value>)",
        "badge-violet": "rgb(var(--badge-violet) / <alpha-value>)",
        "badge-emerald": "rgb(var(--badge-emerald) / <alpha-value>)",
        "badge-sky": "rgb(var(--badge-sky) / <alpha-value>)",
        "badge-amber": "rgb(var(--badge-amber) / <alpha-value>)",
      },
      fontSize: {
        // Tailwind базовая шкала переопределена через extend — оригинал работает,
        // плюс наши дисплей/тайтл/боди.
        "display-sm": ["24px", "28px"],
        "display-md": ["32px", "38px"],
        "display-lg": ["44px", "48px"],
        "display-xl": ["56px", "60px"],

        "title-lg": ["20px", "26px"],
        "title-md": ["18px", "25px"],
        "title-sm": ["16px", "22px"],

        "body-lg": ["17px", "26px"],
        "body-md": ["16px", "24px"],
        "body-sm": ["14px", "21px"],

        caption: ["13px", "18px"],
        "caption-xs": ["12px", "16px"],
        button: ["15px", "20px"],
        nav: ["14px", "20px"],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px", // сигнатурный category-tile
        "2xl": "28px",
        pill: "9999px",
      },
      screens: {
        // xs добавлен поверх дефолтных sm:640 / md:768 / lg:1024 / xl:1280 / 2xl:1536
        xs: "480px",
      },
      letterSpacing: {
        // DESIGN_SYSTEM §4.2 — negative tracking на display
        tightest: "-2px",
        tighter: "-1.5px",
        tight: "-1px",
        snug: "-0.5px",
      },
      fontFamily: {
        // Inter загружается в app/_layout.tsx через @expo-google-fonts/inter.
        // По умолчанию AppText использует Inter_400Regular через prop weight.
        // Эти классы — для случаев, когда нужно применить вручную в style/className.
        sans: ["Inter_400Regular", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
