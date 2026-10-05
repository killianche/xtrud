/**
 * Логика шага «Какая категория?» в два этапа: раздел → подраздел.
 *
 * DECISION владельца 2026-10-04 (скриншот): длинный список всех подкатегорий
 * со всех разделов и подписью «можно отметить до 3» — слишком длинно и
 * непонятно. Нужно «сначала заходит в категорию, и ему раскрываются
 * подкатегории», «быстро найти то, что нужно». Категория в задании теперь
 * одна (`extra_l2_ids` в данных остаётся для совместимости — см.
 * `order-categories.ts`, но этот шаг их больше не предлагает).
 *
 * Чистая логика без React — проверяется тестами. Экран и компонент:
 * `app/(details)/orders/new.tsx`, `CategoryPickerTwoStep.tsx`.
 */

import type { CategoryL1 } from "@/features/categories/use-categories-l1";
import type { VisibleCategory } from "@/features/categories/use-visible-categories";

export interface CategoryGroup {
  section: CategoryL1;
  items: VisibleCategory[];
}

/** Разделы с хотя бы одной видимой подкатегорией, в порядке разделов. */
export function groupCategoriesByL1(
  sections: readonly CategoryL1[],
  categories: readonly VisibleCategory[],
): CategoryGroup[] {
  return sections
    .map((section) => ({ section, items: categories.filter((c) => c.l1_id === section.id) }))
    .filter((group) => group.items.length > 0);
}

/** Раздел выбранной категории — чтобы при возврате он был уже раскрыт. */
export function findSectionIdForCategory(
  categories: readonly VisibleCategory[],
  categoryId: string,
): string | null {
  return categories.find((c) => c.id === categoryId)?.l1_id ?? null;
}
