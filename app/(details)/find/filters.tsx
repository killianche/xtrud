/**
 * /find/filters — раньше отдельный экран фильтров. С 2026-09-06 фильтры живут
 * чипами прямо под заголовком ленты «Задания» (как строка фильтров под
 * поиском в iOS), а подробный выбор — в системных шторках. Маршрут оставлен
 * ради старых переходов и ведёт на ленту.
 */

import { Redirect } from "expo-router";

export default function OrdersSearchFiltersRedirect() {
  return <Redirect href={"/(tabs)/find" as never} />;
}
