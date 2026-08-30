-- Migration 0084 — переработка search_categories RPC: prefix-match + smart trigram + range-separated source-веса.
--
-- Why. User feedback 2026-05-16: «у нас поиск кривой: рез не находит, а резк
-- находит» / «почему такой ужасный поиск?». Research-агент (Yandex.Услуги,
-- Profi.ru, Avito, Google, Thumbtack, Algolia, Meilisearch, Baymard) указал
-- три критических бага в текущем RPC 0062.
--
-- Баг 1 — нет prefix-расширения.
--   `websearch_to_tsquery('russian', 'рез')` создаёт лексему 'рез' после
--   стемминга. Стеммер работает по полным словам — лемматизация, не
--   prefix-expansion. 'рез' != 'резк' (лемма «Резки» / «Резка»), `@@` мимо.
--   То же для 'тех', 'сан', 'обо', 'лам', 'гип' — весь класс коротких
--   префиксов возвращает 0 хитов из FTS-слоя.
--   Fix: использовать `to_tsquery(... || ':*')` — prefix-marker pg-FTS.
--   Префикс ставим только на ПОСЛЕДНИЙ токен (эталон Algolia/Google):
--     'сантехник плитка' → 'сантехник & плитка:*' (не оба с :*).
--
-- Баг 2 — trigram-fallback слабый для коротких запросов.
--   `lower(name_ru) % 'рез'` использует глобальный pg_trgm.similarity_threshold
--   (0.3 по умолчанию). 'рез' vs 'Резка / алмазное бурение' даёт sim ~0.12
--   — fail. Решение: для коротких запросов (≤4 chars) понижаем порог до 0.18
--   через явный `similarity(...) >=` вместо оператора `%`. Глобально
--   `set_limit()` не трогаем — это session-level, сломает другие функции.
--
-- Баг 3 — source-веса конкурируют непредсказуемо.
--   Сейчас: synonym 0–1 (weight/100), fts 0.7 (фикс), trigram 0–0.5.
--   Синоним weight=50 → 0.5, проигрывает FTS 0.7 → ручной тезаурус бьётся
--   автоматическим матчем. Это переворачивает интент: маппинг «обои → finishing»
--   должен ВСЕГДА выигрывать у морфологии. Fix — range-separation:
--     synonym:   0.60 + (weight/100) * 0.40   → [0.60 .. 1.00]
--     fts:       0.30 + ts_rank * 0.30        → [0.30 .. 0.60]
--     trigram:   similarity(...) * 0.30       → [0.00 .. 0.30]
--   Каждый source держит свой диапазон — порядок гарантирован.
--
-- Что НЕ меняется:
--   - Структура trigram/FTS индексов (уже корректные).
--   - Колонка fts_doc (GENERATED ALWAYS AS to_tsvector).
--   - Таблица category_terms.
--   - Возвращаемые поля RPC (kind/id/name_ru/l2_id/score/source) — UI-совместимо.

CREATE OR REPLACE FUNCTION public.search_categories(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE (
  kind text,
  id text,
  name_ru text,
  l2_id text,
  score numeric,
  source text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q          text;
  v_q_clean    text;
  v_ts_str     text;
  v_tsq        tsquery;
  v_trgm_thr   numeric;
BEGIN
  v_q := lower(trim(coalesce(p_query, '')));
  IF length(v_q) < 2 THEN
    RETURN;  -- слишком короткий запрос
  END IF;

  -- Trigram threshold: на коротких запросах (≤4) понижаем — иначе 3-символьная
  -- подстрока vs 20-символьное название даёт similarity ~0.1, не проходит 0.3.
  v_trgm_thr := CASE WHEN length(v_q) <= 4 THEN 0.18 ELSE 0.3 END;

  -- Sanitize: убираем pg_tsquery-spec символы которые могут уронить cast.
  -- Допустимы кириллица/латиница/цифры/пробел. Остальное в пробел.
  v_q_clean := regexp_replace(v_q, '[^а-яёa-z0-9\s]+', ' ', 'g');
  v_q_clean := regexp_replace(trim(v_q_clean), '\s+', ' ', 'g');

  -- Строим prefix-tsquery: последний токен получает :*, остальные exact.
  -- 'сантехник плитка' → 'сантехник & плитка:*'
  -- 'рез' → 'рез:*' — это решает главный баг (короткие префиксы).
  SELECT string_agg(
           CASE WHEN ord = max_ord THEN tok || ':*' ELSE tok END,
           ' & '
         )
    INTO v_ts_str
  FROM (
    SELECT tok,
           ord,
           max(ord) OVER () AS max_ord
    FROM regexp_split_to_table(v_q_clean, '\s+') WITH ORDINALITY AS t(tok, ord)
    WHERE length(tok) > 0
  ) s;

  -- Защита от пустой строки после sanitize (например, ввод "!!!"")
  IF v_ts_str IS NULL OR v_ts_str = '' THEN
    RETURN;
  END IF;

  -- Cast в tsquery с фоллбеком — если как-то получили невалидный синтаксис,
  -- используем plainto_tsquery (без prefix). Лучше отдать что-то чем 500.
  BEGIN
    v_tsq := to_tsquery('russian', v_ts_str);
  EXCEPTION WHEN OTHERS THEN
    v_tsq := plainto_tsquery('russian', v_q);
  END;

  RETURN QUERY
  WITH all_matches AS (
    -- ──────────────────────────────────────────────────────
    -- Слой 1: thesaurus — точный/похожий синоним.
    -- Range: 0.60 .. 1.00 (synonym ВСЕГДА бьёт fts/trigram при равном match).
    -- ──────────────────────────────────────────────────────
    SELECT
      CASE WHEN ct.l2_id IS NOT NULL THEN 'l2' ELSE 'l3' END AS kind,
      coalesce(ct.l2_id, ct.l3_id) AS id,
      coalesce(l2.name_ru, l3.name_ru) AS name_ru,
      coalesce(l2.id, l3.l2_id) AS l2_id,
      CASE
        WHEN lower(ct.term) = v_q THEN 0.60 + (ct.weight / 100.0) * 0.40
        ELSE 0.60 + similarity(lower(ct.term), v_q) * (ct.weight / 100.0) * 0.40
      END AS score,
      'synonym'::text AS source
    FROM public.category_terms ct
    LEFT JOIN public.categories_l2 l2 ON l2.id = ct.l2_id
    LEFT JOIN public.categories_l3 l3 ON l3.id = ct.l3_id
    WHERE lower(ct.term) % v_q OR lower(ct.term) = v_q

    UNION ALL

    -- ──────────────────────────────────────────────────────
    -- Слой 2: FTS с prefix-расширением. Range: 0.30 .. 0.60.
    -- ──────────────────────────────────────────────────────
    SELECT 'l2'::text AS kind, l2.id, l2.name_ru, l2.id AS l2_id,
           (0.30 + ts_rank(l2.fts_doc, v_tsq) * 0.30)::numeric AS score,
           'fts'::text AS source
    FROM public.categories_l2 l2
    WHERE l2.fts_doc @@ v_tsq
      AND l2.is_active = true AND l2.is_visible = true

    UNION ALL

    SELECT 'l3'::text AS kind, l3.id, l3.name_ru, l3.l2_id,
           (0.30 + ts_rank(l3.fts_doc, v_tsq) * 0.30)::numeric AS score,
           'fts'::text AS source
    FROM public.categories_l3 l3
    WHERE l3.fts_doc @@ v_tsq
      AND l3.is_active = true

    UNION ALL

    -- ──────────────────────────────────────────────────────
    -- Слой 3: pg_trgm fuzzy — опечатки и mid-string match.
    -- Range: 0.00 .. 0.30. Threshold dynamic (0.18 для коротких, 0.3 иначе).
    -- ──────────────────────────────────────────────────────
    SELECT 'l2'::text AS kind, l2.id, l2.name_ru, l2.id AS l2_id,
           (similarity(lower(l2.name_ru), v_q) * 0.30)::numeric AS score,
           'trigram'::text AS source
    FROM public.categories_l2 l2
    WHERE similarity(lower(l2.name_ru), v_q) >= v_trgm_thr
      AND l2.is_active = true AND l2.is_visible = true

    UNION ALL

    SELECT 'l3'::text AS kind, l3.id, l3.name_ru, l3.l2_id,
           (similarity(lower(l3.name_ru), v_q) * 0.30)::numeric AS score,
           'trigram'::text AS source
    FROM public.categories_l3 l3
    WHERE similarity(lower(l3.name_ru), v_q) >= v_trgm_thr
      AND l3.is_active = true
  )
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
  'Sprint 0084 (2026-05-16): prefix-match + dynamic trigram + range-separated source weights. Fix для багов: «рез» не находит / «тех» не находит / synonym проигрывает FTS. Эталоны: Yandex.Услуги, Profi.ru, Algolia, Meilisearch. Полная research-заметка — SESSION_SUMMARY_2026-05-16.md § N+7.';
