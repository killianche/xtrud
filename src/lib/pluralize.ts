/**
 * Русские склонения по количеству. Чистые функции — тестируются в Node.
 *
 * Правило русского языка:
 *   - 1, 21, 31… → форма "одного"   (но НЕ 11)
 *   - 2-4, 22-24… → форма "немногих" (но НЕ 12-14)
 *   - 0, 5-20, 25-30… → форма "многих"
 */

export function pluralizeRu(
  count: number,
  forms: { one: string; few: string; many: string },
): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 19) return forms.many;
  if (mod10 === 1) return forms.one;
  if (mod10 >= 2 && mod10 <= 4) return forms.few;
  return forms.many;
}

export function pluralizeReviews(count: number): string {
  return `${count} ${pluralizeRu(count, {
    one: "отзыв",
    few: "отзыва",
    many: "отзывов",
  })}`;
}

export function pluralizeYears(count: number): string {
  return `${count} ${pluralizeRu(count, {
    one: "год",
    few: "года",
    many: "лет",
  })}`;
}

export function pluralizeClosedDeals(count: number): string {
  return `${count} ${pluralizeRu(count, {
    one: "заказ выполнен",
    few: "заказа выполнено",
    many: "заказов выполнено",
  })}`;
}

export function pluralizeClosedOrders(count: number): string {
  return `${count} ${pluralizeRu(count, {
    one: "заказ закрыт",
    few: "заказа закрыто",
    many: "заказов закрыто",
  })}`;
}

export function pluralizeServices(count: number): string {
  return `${count} ${pluralizeRu(count, {
    one: "услуга",
    few: "услуги",
    many: "услуг",
  })}`;
}

/**
 * «5 откликов» / «1 отклик» / «3 отклика» / «Нет откликов» (n=0).
 *
 * UX-нюанс: при 0 откликах показываем «Нет откликов» вместо «0 откликов»
 * — это более естественно по-русски и одновременно помогает клиенту понять
 * статус заказа.
 */
export function pluralizeResponses(count: number): string {
  if (count === 0) return "Нет откликов";
  return `${count} ${pluralizeRu(count, {
    one: "отклик",
    few: "отклика",
    many: "откликов",
  })}`;
}
