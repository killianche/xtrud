/**
 * Разбивает строку на сегменты по вхождениям подстроки `query` (case-insensitive).
 *
 * Возвращает массив `{ text, match }` где `match=true` для совпавших фрагментов.
 * UI рендерит match-сегменты bold + ink, non-match — regular + mute.
 *
 * Пример:
 *   highlightMatch("Демонтаж дверей", "д")
 *   → [
 *       { text: "Д", match: true },
 *       { text: "емонтаж ", match: false },
 *       { text: "д", match: true },
 *       { text: "верей", match: false }
 *     ]
 *
 * Пустой `query` → один сегмент { text, match: false }.
 */

export type HighlightSegment = {
  text: string;
  match: boolean;
};

export function highlightMatch(text: string, query: string): HighlightSegment[] {
  if (!query || query.length === 0) {
    return [{ text, match: false }];
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: text.slice(cursor, idx), match: false });
    }
    segments.push({ text: text.slice(idx, idx + query.length), match: true });
    cursor = idx + query.length;
  }
  return segments;
}

/**
 * Фильтр services по поисковому запросу. Case-insensitive contains по name_ru.
 * Пустой query → возвращает первые `limit` (для дефолтного состояния «всё видно»).
 */
export function filterServicesByQuery<T extends { name_ru: string }>(
  services: T[],
  query: string,
  limit = 50,
): T[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return services.slice(0, limit);
  }
  const q = trimmed.toLowerCase();
  return services.filter((s) => s.name_ru.toLowerCase().includes(q)).slice(0, limit);
}
