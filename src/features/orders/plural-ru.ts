// Русское склонение числительных для счётчиков в интерфейсе.
//
// «1 отклик», «2 отклика», «5 откликов» — без этого счётчик выглядит
// машинным переводом. Правило стандартное: последняя цифра решает, кроме
// чисел 11–14, где всегда родительный множественного.

export function pluralRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  if (abs >= 11 && abs <= 14) return many;
  const last = abs % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** «3 отклика» — число вместе со словом. */
export function responsesLabel(count: number): string {
  return `${count} ${pluralRu(count, "отклик", "отклика", "откликов")}`;
}
