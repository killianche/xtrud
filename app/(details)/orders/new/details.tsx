/**
 * /orders/new/details — отдельного шага больше нет: описание и фото теперь на
 * экране «Что нужно сделать?» (владелец, 2026-09-13). Маршрут оставлен, чтобы
 * старые ссылки и восстановленная навигация не падали.
 */

import { Redirect } from "expo-router";

export default function TaskDetailsRedirect() {
  return <Redirect href="/orders/new/title" />;
}
