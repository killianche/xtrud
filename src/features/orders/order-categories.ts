/**
 * Задание в нескольких категориях (0195, владелец 2026-09-13).
 *
 * `l2_id` — основная категория: по ней карточка, отклики, отзывы и рейтинг.
 * `extra_l2_ids` — до двух дополнительных: задание видят и получают рассылку
 * мастера любой из них. Всего не больше трёх.
 */

export const MAX_TASK_CATEGORIES = 3;

/** Все категории задания по порядку: основная, затем дополнительные. */
export function orderCategoryIds(order: {
  l2_id: string | null | undefined;
  extra_l2_ids?: readonly string[] | null;
}): string[] {
  const out: string[] = [];
  for (const id of [order.l2_id, ...(order.extra_l2_ids ?? [])]) {
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Фильтр PostgREST «задание в любой из категорий»: основная в списке или
 * дополнительные пересекаются со списком. Для `.or(...)`.
 */
export function orderCategoryFilter(l2Ids: readonly string[]): string {
  const ids = l2Ids.join(",");
  return `l2_id.in.(${ids}),extra_l2_ids.ov.{${ids}}`;
}

export interface TaskCategories {
  l2Id: string;
  extraL2Ids: string[];
}

/**
 * Нажатие на категорию в конструкторе. Первая отмеченная — основная; снятие
 * основной делает основной следующую. `null` — уже выбрано максимум.
 */
export function toggleTaskCategory(current: TaskCategories, id: string): TaskCategories | null {
  const all = orderCategoryIds({ l2_id: current.l2Id, extra_l2_ids: current.extraL2Ids });
  if (all.includes(id)) {
    const rest = all.filter((x) => x !== id);
    return { l2Id: rest[0] ?? "", extraL2Ids: rest.slice(1) };
  }
  if (all.length >= MAX_TASK_CATEGORIES) return null;
  const next = [...all, id];
  return { l2Id: next[0] ?? "", extraL2Ids: next.slice(1) };
}
