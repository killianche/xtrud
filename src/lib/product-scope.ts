// Product scope: какие разделы каталога (L1) показываются в приложении.
//
// ИСТОРИЯ. До 2026-09-06 здесь был зашит список из двух разделов
// (`construction`, `home-services`), и три места фильтровали каталог по нему:
// хук L1, хук L2 и генератор встроенного каталога. Когда миграция 0157
// разложила категории по семи разделам, приложение молча спрятало всё, что
// переехало в новые — 23 категории из 42. Список в коде и список в базе
// разошлись, и победил код.
//
// РЕШЕНИЕ. Источник истины один — база: раздел показывается, если у него
// `categories_l1.is_active = true`. Никаких списков в коде. Что база отдала —
// то и каталог; выключить раздел можно одной строкой в админке, а не
// релизом приложения.
//
// Фильтр по L2 остаётся как защита от осиротевших категорий: L2, чей раздел
// приложению неизвестен (выключен или удалён), не показывается.

export interface ScopedSection {
  id: string;
  is_active: boolean;
}

/** Множество id активных разделов из ответа базы или встроенного каталога. */
export function activeSectionIds(sections: readonly ScopedSection[]): Set<string> {
  return new Set(sections.filter((s) => s.is_active).map((s) => s.id));
}

/** Оставить только L2, чей раздел активен. */
export function filterL2BySections<T extends { l1_id: string }>(
  items: readonly T[],
  sections: readonly ScopedSection[],
): T[] {
  const active = activeSectionIds(sections);
  return items.filter((c) => active.has(c.l1_id));
}

/**
 * Служебная скрытая категория «Без категории» (0230, №251): задание, которому
 * не подошла ни одна категория, публикуется в неё и попадает в очередь
 * админки; админ назначает категорию или создаёт новую. В каталоге и выборе
 * специалиста её нет (is_visible = false).
 */
export const UNCATEGORIZED_L2_ID = "uncategorized";

/**
 * Основные разделы (владелец, 2026-10-07, №294/№296): «разнорабочие, уборку и
 * ремонт бытовой техники подсветить — это актуальнейшие темы». Подсвечены в
 * сетке «Специалистов» и в каталоге, стоят рядом под заголовком «Найти
 * задание». Короткое имя — для плитки в ряд из четырёх. Без надписи
 * «популярное»: интерфейс не утверждает неизмеренного (design-quality §5).
 */
export const FEATURED_SECTIONS: readonly { id: string; short: string }[] = [
  { id: "handyman-moving", short: "Мастер на час" },
  { id: "home-services", short: "Уборка" },
  { id: "home-appliances", short: "Ремонт техники" },
];

export const FEATURED_SECTION_IDS: readonly string[] = FEATURED_SECTIONS.map((s) => s.id);
