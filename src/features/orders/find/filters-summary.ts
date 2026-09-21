/**
 * Сводка выбранных фильтров для строки «Фильтры» на экране «Найти задание»
 * (docs/FIND_SCREEN_REDESIGN.md §3.3). Чистая функция — проверяется тестом.
 *
 * Правила: раздел целиком — его название; одна-две категории — через запятую;
 * больше — «первая, вторая и ещё N»; место — после « · ». Ничего не выбрано —
 * null (строка показывает просто «Фильтры»).
 */

export interface FiltersSummaryInput {
  l2Ids: string[];
  cityId: string;
  district: string;
  categories: { id: string; name_ru: string; l1_id: string }[];
  sections: { id: string; name_ru: string }[];
  /** Название города по id; район приходит названием. */
  cityName?: string;
}

export function filtersSummary(input: FiltersSummaryInput): string | null {
  const parts: string[] = [];
  if (input.l2Ids.length > 0) {
    const section = input.sections.find((s) => {
      const ids = input.categories.filter((c) => c.l1_id === s.id).map((c) => c.id);
      return (
        ids.length > 0 &&
        ids.length === input.l2Ids.length &&
        ids.every((id) => input.l2Ids.includes(id))
      );
    });
    if (section) {
      parts.push(section.name_ru);
    } else {
      const names = input.l2Ids
        .map((id) => input.categories.find((c) => c.id === id)?.name_ru)
        .filter((n): n is string => !!n);
      if (names.length === 0) parts.push(`Категории · ${input.l2Ids.length}`);
      else if (names.length <= 2) parts.push(names.join(", "));
      else parts.push(`${names[0]}, ${names[1]} и ещё ${names.length - 2}`);
    }
  }
  const place = input.cityId ? (input.cityName ?? null) : input.district || null;
  if (place) parts.push(place);
  return parts.length > 0 ? parts.join(" · ") : null;
}
