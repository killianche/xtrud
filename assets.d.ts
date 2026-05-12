// Type declarations для статических assets (шрифты, изображения).
// Metro bundler преобразует import шрифта в number (module-id), Expo Font
// принимает либо number, либо require(...) — поэтому number здесь корректен.

declare module "*.ttf" {
  const value: number;
  export default value;
}

declare module "*.otf" {
  const value: number;
  export default value;
}

declare module "*.woff" {
  const value: number;
  export default value;
}

declare module "*.woff2" {
  const value: number;
  export default value;
}
