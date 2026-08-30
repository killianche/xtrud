/**
 * Иллюстрации xtrud — inline SVG, theme-aware.
 *
 * Используем вместо Lottie для контекстов где анимация не критична
 * (hero / callout / empty-state). Каждая ≤ 5 КБ JS против 100-400 КБ
 * Lottie JSON — ощутимо легче на медленном интернете в регионе.
 *
 * Стиль: Vercel/Linear — outline-only, stroke 1.5, theme-aware из палитры
 * `colors.ts`. Без людей.
 */
export { DescribeTaskIllustration } from "./DescribeTaskIllustration";
