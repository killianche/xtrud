/**
 * /find — вкладка «Найти задание»: лента открытых заданий с поиском и
 * фильтром внутри списка (docs/FIND_SCREEN_REDESIGN.md, редизайн 2026-09-21).
 *
 * Это таб, а не detail-экран: нижняя панель не скрывается, «назад» в шапке
 * нет. Крупный заголовок и его схлопывание — системные (см. _layout.tsx).
 */

import { FindFeed } from "@/features/orders/find/FindFeed";

export default function FindScreen() {
  return <FindFeed />;
}
