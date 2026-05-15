// Product scope: какие L1 разделы каталога АКТИВНЫ в текущем релизе.
//
// Решение user 2026-05-15 (повторное уточнение): xtrud — нишевый сервис
// под РЕМОНТ + СТРОЙКУ + БЫТ (включая клининг). Изначально 10 L1, но
// 8 (Авто, Перевозки, Бьюти, Образование, События, Бизнес, IT,
// Личный сервис) удалены физически — миграция 0068_drop_out_of_scope_categories.sql.
// Этот файл оставлен как «второй защитный слой» на случай восстановления
// out-of-scope категорий через seed/restore — фильтр выкинет их из UI.
//
// Архитектура: фильтр применяется в хуках `useCategoriesL1` /
// `useVisibleCategories`. После миграции 0068 в БД остаются 2 L1
// (`construction`, `home-services`), и они оба перечислены здесь —
// фильтр фактически no-op, но защищает от случайного появления oos
// записей.
//
// **Расширение scope (если когда-то вернуть авто/бьюти):** нужно (1)
// перевыполнить seed с категориями, (2) добавить id в IN_SCOPE_L1_IDS.

/**
 * L1 разделы, которые показываются клиентам и мастерам в текущем релизе.
 * После миграции 0068 в БД физически живут только эти L1 — список
 * совпадает с реальным состоянием БД.
 */
export const IN_SCOPE_L1_IDS: ReadonlyArray<string> = [
  "construction",
  "home-services",
] as const;

/** True если L1 показывается в каталоге сейчас. */
export function isL1InScope(l1Id: string | null | undefined): boolean {
  if (!l1Id) return false;
  return IN_SCOPE_L1_IDS.includes(l1Id);
}

/**
 * Фильтр массива L1-объектов по scope. Используется поверх результата
 * `useCategoriesL1()` или вручную над `categories_l1`-данными.
 */
export function filterL1ByScope<T extends { id: string }>(items: T[]): T[] {
  return items.filter((c) => isL1InScope(c.id));
}

/**
 * Фильтр массива L2-объектов: оставить только те, которые принадлежат
 * in-scope L1. Полезно для category-select / filters где user выбирает L2.
 */
export function filterL2ByScope<T extends { l1_id: string }>(items: T[]): T[] {
  return items.filter((c) => isL1InScope(c.l1_id));
}
