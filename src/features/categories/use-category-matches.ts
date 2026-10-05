/**
 * Подбор подкатегорий по словам человека — общий для конструктора задания,
 * «Специалистов» и фильтра «Найти задание» (№241, docs/CATEGORY_QUICK_PICK_2026-10.md).
 *
 * Порядок: мгновенные совпадения по названию подкатегории (без сети), затем
 * умный поиск search_categories — синонимы и услуги («поменять розетку» →
 * Электрика, услуга «Замена розетки / выключателя»); без сети — встроенный
 * каталог; затем пословный подбор для длинных фраз (searchCatalogByWords).
 * Последними — подкатегории раздела, если совпало его название.
 */

import { useMemo } from "react";
import { searchCatalogByWords } from "@/features/categories/bundled-task-catalog";
import type { CategoryL1 } from "@/features/categories/use-categories-l1";
import { type SearchHit, useSearchCategories } from "@/features/categories/use-search-categories";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export interface CategoryMatch<T> {
  category: T;
  /** Совпавшая услуга подкатегории («Замена розетки / выключателя»), если нашлась по ней. */
  service?: string;
}

/** Чистая часть подбора — порядок и услуги; проверяется тестами. */
export function mergeCategoryMatches<T extends { id: string; l1_id: string; name_ru: string }>(
  query: string,
  categories: readonly T[],
  sections: readonly Pick<CategoryL1, "id" | "name_ru">[],
  hits: readonly Pick<SearchHit, "kind" | "name_ru" | "l2_id" | "source">[],
): CategoryMatch<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const order: string[] = [];
  const service = new Map<string, string>();
  const add = (id: string) => {
    if (byId.has(id) && !order.includes(id)) order.push(id);
  };

  for (const c of categories) if (c.name_ru.toLowerCase().includes(q)) add(c.id);
  for (const hit of hits) {
    add(hit.l2_id);
    // Услуга подписью — только при совпадении по словам или синонимам: близость
    // букв (trigram) даёт «Перевезти стройматериалы» на «перевезти диван».
    const reliable = /fts|synonym/.test(hit.source);
    if (hit.kind === "l3" && reliable && byId.has(hit.l2_id) && !service.has(hit.l2_id)) {
      service.set(hit.l2_id, hit.name_ru);
    }
  }
  const sectionIds = new Set(
    sections.filter((s) => s.name_ru.toLowerCase().includes(q)).map((s) => s.id),
  );
  for (const c of categories) if (sectionIds.has(c.l1_id)) add(c.id);

  return order.flatMap((id) => {
    const category = byId.get(id);
    return category ? [{ category, service: service.get(id) }] : [];
  });
}

const NO_SECTIONS: readonly CategoryL1[] = [];

/** Подсказки — с двух букв: одна буква совпадает почти со всем каталогом. */
export const MIN_MATCH_QUERY = 2;

export function useCategoryMatches<T extends { id: string; l1_id: string; name_ru: string }>(
  query: string,
  categories: readonly T[],
  sections: readonly CategoryL1[] = NO_SECTIONS,
  /** С какой длины подбирать: «Специалисты» и фильтр — с первой буквы, как раньше. */
  minQuery = MIN_MATCH_QUERY,
): { matches: CategoryMatch<T>[]; searching: boolean; tooShort: boolean } {
  const q = query.trim().toLowerCase();
  const tooShort = q.length < minQuery;
  // Названия совпадают сразу, без сети; умный поиск — через 250 мс после
  // последней буквы, а не запросом на каждую (№242).
  const debounced = useDebouncedValue(q, 250);
  const search = useSearchCategories(tooShort ? "" : debounced, 12);
  const rpcHits = search.data?.hits;
  // Фразы своими словами («нужно поменять розетку на кухне») сервер целиком
  // не находит — их добирает пословный подбор по встроенному каталогу.
  const wordHits = useMemo(
    () =>
      searchCatalogByWords(debounced, 5).map((h) => ({
        kind: h.service ? ("l3" as const) : ("l2" as const),
        name_ru: h.service ?? "",
        l2_id: h.l2_id,
        source: "fts",
      })),
    [debounced],
  );
  const matches = useMemo(
    () =>
      tooShort
        ? []
        : mergeCategoryMatches(q, categories, sections, [...(rpcHits ?? []), ...wordHits]),
    [tooShort, q, categories, sections, rpcHits, wordHits],
  );
  return {
    matches,
    searching: !tooShort && (search.isFetching || debounced !== q),
    tooShort,
  };
}
