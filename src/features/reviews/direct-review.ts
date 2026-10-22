// Логика отзыва без задания (0254, №356) — вынесена из экранов, чтобы быть
// проверяемой без React: какой режим кнопки «Оставить отзыв» показать на
// профиле специалиста (docs/REVIEWS_WITHOUT_ORDER_2026-10.md §7.1) и валидна
// ли длина текста для режима без задания (§7.3, правило 5: от 20 символов).

/** Максимум символов в поле комментария — общий для обоих режимов (§7.3). */
export const MAX_REVIEW_TEXT_LENGTH = 500;
/** Минимум символов для отзыва без задания; по заданию текст необязателен. */
export const MIN_DIRECT_REVIEW_TEXT_LENGTH = 20;

export function isDirectReviewTextValid(text: string): boolean {
  return text.trim().length >= MIN_DIRECT_REVIEW_TEXT_LENGTH;
}

/**
 * Знаменатель счётчика «{length} / N»: пока текст короче минимума — считаем
 * до минимума (прогресс к условию), после — до общего максимума (§7.3).
 */
export function directReviewCounterMax(textLength: number): number {
  return textLength < MIN_DIRECT_REVIEW_TEXT_LENGTH
    ? MIN_DIRECT_REVIEW_TEXT_LENGTH
    : MAX_REVIEW_TEXT_LENGTH;
}

export type MasterReviewAction = "order" | "direct" | "guest" | "none";

/**
 * Какой режим «Оставить отзыв» показать на профиле специалиста (§7.1,
 * состояния 1–5). Приоритет: отзыв по заданию (ценнее для рейтинга, не
 * зависит от публикации профиля — задание уже было завершено) → гость
 * (ведём ко входу) → отзыв без задания, если ещё не оставлен и профиль
 * специалиста опубликован.
 *
 * `hasDirectReview` — `undefined`, пока запрос «уже оставил?» не загрузился:
 * до ответа кнопка не показывается (не утверждаем то, что не проверено), а
 * не мигает видимой и тут же пропадает.
 *
 * `isMasterProfilePublished` — дополнение к контракту (2026-10-22): сервер
 * принимает отзыв без задания только если `master_profiles.status =
 * 'active'` и адресат `users.status = 'active'`, не демо; иначе RPC вернёт
 * «Этому специалисту сейчас нельзя оставить отзыв.». Кнопка не должна
 * обещать то, что сервер откажет.
 */
export function resolveMasterReviewAction(input: {
  isOwn: boolean;
  isGuest: boolean;
  hasReviewableOrder: boolean;
  hasDirectReview: boolean | undefined;
  isMasterProfilePublished: boolean;
}): MasterReviewAction {
  if (input.isOwn) return "none";
  if (input.hasReviewableOrder) return "order";
  if (input.isGuest) return "guest";
  if (input.hasDirectReview === false && input.isMasterProfilePublished) return "direct";
  return "none";
}
