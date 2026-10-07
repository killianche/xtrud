/**
 * Категория для задания, написанного своими словами (№259, как у YouDo):
 * человек не выбрал подсказку и нажал «Далее» — категорию ставим сами, а на
 * форме её видно и можно поменять.
 *
 * Порядок — от точного к осторожному:
 *  1. лучшая подсказка-формулировка: все слова запроса нашлись в ней;
 *  2. пословный подбор по каталогу — только при явном лидере: на «ремонт
 *     котла» сразу пять подкатегорий с одним счётом, наугад не ставим;
 *  3. иначе — «Без категории»: подберёт админ (№251).
 * Сервер (search_categories) здесь не участвует: на длинной фразе он
 * отдаёт случайное по близости букв («ремонт котла» → «Кровля»).
 */

import type { CatalogWordHit } from "@/features/categories/bundled-task-catalog";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";

/** Во сколько раз лидер должен опережать второго, чтобы ставить его молча. */
const LEADER_MARGIN = 1.25;

export function guessCategoryId(
  phraseHits: readonly { l2: string }[],
  wordHits: readonly Pick<CatalogWordHit, "l2_id" | "score">[],
  visible: ReadonlySet<string>,
): string {
  const phrase = phraseHits.find((p) => visible.has(p.l2));
  if (phrase) return phrase.l2;
  const ranked = wordHits.filter((h) => visible.has(h.l2_id));
  const [first, second] = ranked;
  if (first && (!second || first.score >= second.score * LEADER_MARGIN)) return first.l2_id;
  return UNCATEGORIZED_L2_ID;
}
