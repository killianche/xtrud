/**
 * Три колонки на обычном шрифте; на крупном слова («Сантехника»,
 * «безопасность») перестают помещаться и рвутся посреди слова — тогда
 * колонок меньше, как в App Store: две с XXL, одна на accessibility-размерах.
 */
export function sectionGridColumns(fontScale: number): number {
  if (fontScale >= 1.6) return 1;
  if (fontScale >= 1.2) return 2;
  return 3;
}
