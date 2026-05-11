import type { Config } from "tailwindcss";

// Минимальная конфигурация в sprint 1.1.
// Полные design tokens (палитра, типографика, spacing) подключаются в sprint 1.2.

const config: Config = {
  // NOTE: paths must include both app/ (Expo Router) and src/ (наши компоненты)
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
