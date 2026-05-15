-- Migration 0062 — Smart search infrastructure (P0-NEW).
--
-- Контекст: research/SEARCH_AUDIT.md. Главный сценарий:
-- клиент вводит «камера» → система ведёт его на L3 «Установка камер
-- видеонаблюдения». Без thesaurus морфология (russian_stem) не поможет —
-- «камера» и «видеонаблюдение» это семантические синонимы, не формы.
--
-- Архитектура — три слоя в одном запросе через UNION ALL:
--   1. Thesaurus (вес 1.0) — точное совпадение с синонимом из category_terms
--   2. FTS русским стеммером (вес 0.7) — морфология «камеры/камер»
--   3. pg_trgm fuzzy (вес 0.5×similarity) — опечатки «камира → камера»
--
-- Раскладка-фикс «rfvthf → камера» делается на клиенте JS, не в SQL —
-- два параллельных запроса с исходной + flipped строками.
--
-- Что меняется в БД:
--   1. extension pg_trgm (для % оператора и similarity).
--   2. Generated column categories_l3.fts_doc — tsvector с russian_stem.
--   3. GIN индекс на fts_doc.
--   4. GIN trigram индекс на lower(name_ru) для опечаток.
--   5. Таблица category_terms (text → l2_id или l3_id с весом).
--   6. RPC search_categories(query) — топ-N L2/L3 с union трёх слоёв.

-- ============================================================================
-- 1. EXTENSION
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. FTS COLUMN + INDEXES для categories_l3
-- ============================================================================

ALTER TABLE public.categories_l3
  ADD COLUMN fts_doc tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(name_ru, ''))
  ) STORED;

CREATE INDEX categories_l3_fts_idx ON public.categories_l3 USING GIN (fts_doc);

-- Триграммный индекс на нормализованное имя — для fuzzy-search опечаток.
CREATE INDEX categories_l3_name_trgm_idx ON public.categories_l3
  USING GIN (lower(name_ru) gin_trgm_ops);

-- Тоже самое для L2 (подкатегорий) — клиент может искать «сантехника»
-- и попадать прямо в L2.
ALTER TABLE public.categories_l2
  ADD COLUMN fts_doc tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(name_ru, ''))
  ) STORED;

CREATE INDEX categories_l2_fts_idx ON public.categories_l2 USING GIN (fts_doc);
CREATE INDEX categories_l2_name_trgm_idx ON public.categories_l2
  USING GIN (lower(name_ru) gin_trgm_ops);

-- ============================================================================
-- 3. THESAURUS — category_terms (text → category_id с весом)
-- ============================================================================

CREATE TABLE public.category_terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Синоним всегда указывает либо на L2, либо на L3 (одна из двух колонок NOT NULL).
  l2_id       text NULL REFERENCES public.categories_l2(id) ON DELETE CASCADE,
  l3_id       text NULL REFERENCES public.categories_l3(id) ON DELETE CASCADE,
  term        text NOT NULL CHECK (length(term) BETWEEN 2 AND 80),
  -- Вес 100 = основной синоним, 50 = свободная ассоциация.
  weight      smallint NOT NULL DEFAULT 100 CHECK (weight BETWEEN 0 AND 100),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_terms_target_check CHECK (
    (l2_id IS NOT NULL AND l3_id IS NULL)
    OR (l2_id IS NULL AND l3_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.category_terms IS
  'Тезаурус синонимов для умного поиска. Один term → одна категория (L2 или L3). Many-to-many через несколько строк (например, "камера" → видеонаблюдение, фотограф). Эталон: Thumbtack expanded list ~1000 terms.';
COMMENT ON COLUMN public.category_terms.weight IS
  'Релевантность синонима. 100 = точный/основной (camera→ video-surv), 50 = ассоциация (cleanup→ remont).';

-- Триграммный индекс для fuzzy match по синонимам.
CREATE INDEX category_terms_term_trgm_idx ON public.category_terms
  USING GIN (lower(term) gin_trgm_ops);

-- Прямой индекс по term для exact match.
CREATE INDEX category_terms_term_lower_idx ON public.category_terms
  ((lower(term)));

-- RLS: чтение публично (поиск доступен анонимам), писать может только admin
-- (через сервис-роль). На MVP — read-only, никто кроме админа не пишет.
ALTER TABLE public.category_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY category_terms_read_all ON public.category_terms
  FOR SELECT USING (true);

-- ============================================================================
-- 4. RPC search_categories — главный API поиска
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_categories(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE (
  kind text,            -- 'l2' | 'l3'
  id text,
  name_ru text,
  l2_id text,           -- для L3 — её родительская L2 (для навигации)
  score numeric,
  source text           -- 'synonym' | 'fts' | 'trigram'
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q text;
BEGIN
  v_q := lower(trim(coalesce(p_query, '')));
  IF length(v_q) < 2 THEN
    RETURN;  -- слишком короткий запрос
  END IF;

  RETURN QUERY
  WITH all_matches AS (
    -- ──────────────────────────────────────────────────────
    -- Слой 1: thesaurus — точное совпадение / похожее с синонимом
    -- ──────────────────────────────────────────────────────
    SELECT
      CASE WHEN ct.l2_id IS NOT NULL THEN 'l2' ELSE 'l3' END AS kind,
      coalesce(ct.l2_id, ct.l3_id) AS id,
      coalesce(l2.name_ru, l3.name_ru) AS name_ru,
      coalesce(l2.id, l3.l2_id) AS l2_id,
      -- exact match → 1.0×weight; fuzzy → similarity × weight
      CASE
        WHEN lower(ct.term) = v_q THEN ct.weight / 100.0
        ELSE similarity(lower(ct.term), v_q) * ct.weight / 100.0
      END AS score,
      'synonym'::text AS source
    FROM public.category_terms ct
    LEFT JOIN public.categories_l2 l2 ON l2.id = ct.l2_id
    LEFT JOIN public.categories_l3 l3 ON l3.id = ct.l3_id
    WHERE lower(ct.term) % v_q OR lower(ct.term) = v_q

    UNION ALL

    -- ──────────────────────────────────────────────────────
    -- Слой 2: FTS русским стеммером — морфология «камеры → камер»
    -- ──────────────────────────────────────────────────────
    SELECT 'l2'::text AS kind, l2.id, l2.name_ru, l2.id AS l2_id,
           0.7::numeric AS score, 'fts'::text AS source
    FROM public.categories_l2 l2
    WHERE l2.fts_doc @@ websearch_to_tsquery('russian', v_q)
      AND l2.is_active = true AND l2.is_visible = true

    UNION ALL

    SELECT 'l3'::text AS kind, l3.id, l3.name_ru, l3.l2_id,
           0.7::numeric AS score, 'fts'::text AS source
    FROM public.categories_l3 l3
    WHERE l3.fts_doc @@ websearch_to_tsquery('russian', v_q)
      AND l3.is_active = true

    UNION ALL

    -- ──────────────────────────────────────────────────────
    -- Слой 3: pg_trgm fuzzy — опечатки «камира → камера»
    -- ──────────────────────────────────────────────────────
    SELECT 'l2'::text AS kind, l2.id, l2.name_ru, l2.id AS l2_id,
           (0.5 * similarity(lower(l2.name_ru), v_q))::numeric AS score,
           'trigram'::text AS source
    FROM public.categories_l2 l2
    WHERE lower(l2.name_ru) % v_q
      AND l2.is_active = true AND l2.is_visible = true

    UNION ALL

    SELECT 'l3'::text AS kind, l3.id, l3.name_ru, l3.l2_id,
           (0.5 * similarity(lower(l3.name_ru), v_q))::numeric AS score,
           'trigram'::text AS source
    FROM public.categories_l3 l3
    WHERE lower(l3.name_ru) % v_q
      AND l3.is_active = true
  )
  -- Дедуплицируем по (kind, id), берём лучший score, конкатенируем sources.
  SELECT
    am.kind,
    am.id,
    am.name_ru,
    am.l2_id,
    max(am.score) AS score,
    string_agg(DISTINCT am.source, ',' ORDER BY am.source) AS source
  FROM all_matches am
  WHERE am.score > 0
  GROUP BY am.kind, am.id, am.name_ru, am.l2_id
  ORDER BY max(am.score) DESC, am.name_ru
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.search_categories IS
  'P0-NEW. Умный поиск по каталогу: thesaurus + russian-FTS + pg_trgm. Возвращает топ-N L2/L3 категорий с score и source. Раскладка-фикс — на клиенте через flipLayout().';

GRANT EXECUTE ON FUNCTION public.search_categories(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_categories(text, int) TO anon;

-- ============================================================================
-- 5. Настройка trigram threshold (default 0.3 — оптимально для коротких слов)
-- ============================================================================

-- Не делаем глобально через ALTER DATABASE — set_limit() влияет на оператор %
-- только в текущей сессии. В RPC используем явный similarity() сравнение
-- (через UNION ALL), а оператор % с порогом по умолчанию (0.3) даёт
-- разумный recall на наших данных.
