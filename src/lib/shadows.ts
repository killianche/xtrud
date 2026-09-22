/**
 * Тени — из одного места и на токене `shadow` (src/lib/colors.ts): чёрная в
 * обеих темах, заметность задаёт прозрачность. Аудит 2026-09-22: раньше
 * `#000000` был вписан в каждый компонент отдельно, и у двух карточек тени
 * отличались.
 */

import { lightColors } from "./colors";

/** Цвет тени. Одинаковый в обеих темах — поэтому без хука темы. */
export const SHADOW_COLOR = lightColors.shadow;

/**
 * Мягкая тень карточки: край читается без опоры на линию (DECISION владельца
 * 2026-09-04), как белая карточка на сером сгруппированном фоне в iOS
 * (владелец, 2026-09-08). Значения скромные: тень обозначает край, а не
 * рисует объём.
 */
export const CARD_SHADOW = {
  shadowColor: SHADOW_COLOR,
  shadowOpacity: 0.04,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
