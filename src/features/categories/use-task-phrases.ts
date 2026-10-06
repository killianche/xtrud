/**
 * Подсказки-формулировки для первого экрана создания задания (№248):
 * поиск по словарю `TASK_PHRASES` только среди видимых подкатегорий (скрытая
 * в каталоге категория не предлагается), до ввода — примеры.
 */

import { useMemo } from "react";
import { searchTaskPhrases } from "./task-phrase-search";
import { TASK_PHRASES, type TaskPhrase } from "./task-phrases";

/** Примеры до ввода: самые частые задачи, по одной на подкатегорию. */
export function examplePhrases(
  phrases: readonly TaskPhrase[],
  visible: ReadonlySet<string>,
  limit: number,
): TaskPhrase[] {
  const seen = new Set<string>();
  return [...phrases]
    .filter((p) => visible.has(p.l2))
    .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text, "ru"))
    .filter((p) => {
      if (seen.has(p.l2)) return false;
      seen.add(p.l2);
      return true;
    })
    .slice(0, limit);
}

export function useTaskPhrases(
  query: string,
  visibleL2Ids: readonly string[],
  limit = 6,
): { hits: TaskPhrase[]; examples: TaskPhrase[] } {
  const visibleKey = visibleL2Ids.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleKey — стабильный ключ списка.
  const visible = useMemo(() => new Set(visibleL2Ids), [visibleKey]);
  const pool = useMemo(() => TASK_PHRASES.filter((p) => visible.has(p.l2)), [visible]);
  const hits = useMemo(
    () => searchTaskPhrases(query, pool, limit).map((h) => h.phrase),
    [query, pool, limit],
  );
  const examples = useMemo(() => examplePhrases(TASK_PHRASES, visible, 6), [visible]);
  return { hits, examples };
}
