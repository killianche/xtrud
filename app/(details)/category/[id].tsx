/**
 * /category/[id] — переход на «Специалисты» с фильтром по категории.
 *
 * DECISION владельца 2026-09-06: «нажал на категорию — сразу на страницу
 * специалистов с заданным фильтром». Отдельный экран категории удалён: он
 * открывался пустым и долго грузился, а показывал тех же людей, что и
 * «Специалисты». Маршрут оставлен ради старых ссылок и переходов внутри
 * приложения — он мгновенно ведёт туда, где теперь живёт список.
 */

import { Redirect, useLocalSearchParams } from "expo-router";

export default function CategoryRedirect() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const l2 = Array.isArray(id) ? id[0] : id;
  return (
    <Redirect href={{ pathname: "/specialists/section", params: { l2: l2 ?? "" } } as never} />
  );
}
