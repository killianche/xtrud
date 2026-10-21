/**
 * Персонализация блоков главной v2 (docs/HOME_V2_2026-10.md §4.2) — чистая
 * логика отбора, без сети и React: источник персонализации — то, что
 * приложение уже знает о человеке (его открытые задания и его категории как
 * специалиста), не абстрактный рейтинг.
 *
 * Вынесено отдельно от хуков, чтобы покрыть правило отбора юнит-тестами
 * (задача xtrud-implementer, зона src/features/home/**).
 */

export interface OpenOrderForPersonalization {
  l2_id: string | null;
  status: string;
  created_at: string;
}

export interface MasterCategoryForPersonalization {
  l2_id: string;
}

/**
 * «Специалисты»: категория самого свежего открытого задания пользователя —
 * источник персонализации карусели (§4.2 п.1). Нет открытых заданий (или они
 * без категории) — `null`, тогда хук уходит в честный фоллбэк по рейтингу
 * (§4.2 п.2/п.3).
 */
export function pickSpecialistsCategoryId(
  orders: readonly OpenOrderForPersonalization[],
): string | null {
  const open = orders.filter((o) => o.status === "open" && o.l2_id);
  if (open.length === 0) return null;
  const freshest = [...open].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  return freshest?.l2_id ?? null;
}

/**
 * «Актуальные задания»: собственные категории человека как специалиста →
 * `l2Ids` для `useAllOpenOrders` (§4.2 «Актуальные задания», п.1). Пусто —
 * `null`, тогда лента остаётся без фильтра, как сегодня (п.2).
 */
export function pickActiveOrdersL2Ids(
  categories: readonly MasterCategoryForPersonalization[],
): string[] | null {
  const ids = Array.from(new Set(categories.map((c) => c.l2_id).filter(Boolean)));
  return ids.length > 0 ? ids : null;
}

/**
 * Фоллбэк на честную витрину по рейтингу срабатывает ТОЛЬКО когда
 * персонализированный запрос дал 0 результатов — «всего одна карточка»
 * остаётся как есть (§4.4, уточнение правила: «фоллбэк срабатывает только
 * при пустом результате персонализированного запроса, не при «всего один»»).
 */
export function shouldFallbackToRatingShowcase(personalizedCount: number): boolean {
  return personalizedCount === 0;
}
