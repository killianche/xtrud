/**
 * Иконки разделов каталога. С №267 (владелец, 2026-10-07: «сменить стиль
 * иконок, как в референсе, но без глаз») — свой плоский набор: скруглённые
 * формы, тень половиной формы, пастельная палитра. Рисунки наши, исходники —
 * assets/images/sections/src/*.svg (viewBox 64), PNG 192×192 получены из них.
 * Ключ — id раздела (categories_l1.id). Новый раздел без картинки рисуется
 * прежней линейной иконкой (getCategoryIcon) — экран не ломается.
 */

import type { ImageSourcePropType } from "react-native";

const ART: Record<string, ImageSourcePropType> = {
  "repair-finishing": require("../../assets/images/sections/repair-finishing.png"),
  utilities: require("../../assets/images/sections/utilities.png"),
  construction: require("../../assets/images/sections/construction.png"),
  "home-services": require("../../assets/images/sections/home-services.png"),
  interior: require("../../assets/images/sections/interior.png"),
  "tech-security": require("../../assets/images/sections/tech-security.png"),
  "handyman-moving": require("../../assets/images/sections/handyman-moving.png"),
  cargo: require("../../assets/images/sections/cargo.png"),
  "computer-help": require("../../assets/images/sections/computer-help.png"),
  auto: require("../../assets/images/sections/auto.png"),
  tutors: require("../../assets/images/sections/tutors.png"),
  "legal-accounting": require("../../assets/images/sections/legal-accounting.png"),
};

export function getSectionArt(sectionId: string): ImageSourcePropType | null {
  return ART[sectionId] ?? null;
}
