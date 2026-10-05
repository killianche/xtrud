/**
 * Раздел из одной подкатегории выбирается сразу, без второго экрана
 * (владелец, 2026-10-05, №239: «Компьютерная помощь — пускай будет только
 * категория, не нужны подкатегории»). Экран со списком из одной строки —
 * лишний шаг (.claude/rules/design-quality.md §1.2).
 */
export function onlyCategoryId(
  categories: readonly { id: string; l1_id: string }[],
  l1Id: string,
): string | null {
  const inSection = categories.filter((c) => c.l1_id === l1Id);
  const [first] = inSection;
  return inSection.length === 1 && first ? first.id : null;
}
