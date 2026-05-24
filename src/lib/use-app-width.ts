/**
 * useAppWidth — «телефонная» ширина приложения.
 *
 * Решение владельца 2026-05-21: сайт всегда открывается в телефонном виде —
 * без планшетной и десктопной раскладки. На web мы зажимаем приложение в
 * колонку шириной ≤ PHONE_MAX_WIDTH (см. <PhoneFrame>). Чтобы и ЛОГИКА
 * раскладок (грид-колонки, isDesktop-ветки, ширина hero/каруселей) считала,
 * что это телефон, все экраны берут ширину отсюда, а не из useWindowDimensions:
 * на web возвращаем min(окно, PHONE_MAX_WIDTH), на native — реальную ширину.
 *
 * Так все проверки вида `width >= 768` становятся false, а full-bleed элементы
 * (фото, баннеры) рисуются ровно по ширине телефонной колонки.
 *
 * Исключение: настоящие полноэкранные оверлеи (лайтбокс фото) продолжают брать
 * реальные размеры окна через useWindowDimensions — им нужен весь экран.
 */

import { Platform, useWindowDimensions } from "react-native";

/** Максимальная ширина телефонной колонки на web (крупный телефон). */
export const PHONE_MAX_WIDTH = 480;

export function useAppWidth(): number {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" ? Math.min(width, PHONE_MAX_WIDTH) : width;
}
