-- 0237: нейросеть знает каталог точно и может предложить новую подкатегорию
-- (TASKS №281–282, 2026-10-07).
--
-- Владелец: «нейросеть должна знать наш каталог точно» и «если ни одна
-- подкатегория не подходит — пусть предложит новую; создаёт админ».
--
-- Было (0236, живая редакция 2026-10-07):
--   * xtrud_private.ai_classify_catalog() → (l2_id, name_ru, section);
--     md5 32ca9e196b09d2f8872fb07a84cdd476.
--   * xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text);
--     md5 8aad49a248de1aa1b179d04bc73e0026.
--   * public.admin_list_ai_category_suggestions(integer) → 10 колонок;
--     md5 95107ae47dad62a56db17f26f74d049c.
--
-- Стало:
--   * ai_classify_catalog() → те же три колонки ПЕРВЫМИ (старый сервер
--     выбирает их по имени и работает дальше) + section_id (categories_l1.id),
--     services (активные услуги categories_l3 через «; », не больше 12) и
--     terms (синонимы category_terms подкатегории и её активных услуг, по
--     весу, через «; », не больше 12, без повторов названия и услуг).
--     Смена типа результата → DROP + CREATE с прежними правами (xtrud_api).
--   * order_ai_classifications.suggested_new jsonb — предложение новой
--     подкатегории {"section_id","name"}; ничего не создаётся автоматически.
--   * ai_classify_result(..., p_suggested_new jsonb DEFAULT NULL) — седьмой
--     необязательный параметр. Старая 6-аргументная функция удаляется (иначе
--     вызов из 6 аргументов стал бы неоднозначным); вызов старого сервера с
--     6 аргументами попадает в новую функцию по умолчанию. Предложение
--     пишется только при итоге 'unsure' и только после проверки базой:
--     объект, section_id — существующий раздел, name 2–60 символов без
--     управляющих/невидимых символов, хотя бы одна буква. Иначе NULL.
--   * admin_list_ai_category_suggestions(p_limit) — + колонка suggested_new
--     ({"section_id","name","section_name"} или NULL) в конце. DROP + CREATE
--     с прежними правами (authenticated, service_role; anon — нет).
--
-- Порядок раскатки: эта миграция → новый xtrud-api (старый сервер с новой
-- базой работает: каталог по именам колонок, результат из 6 аргументов).
-- Откат: 0237_ai_catalog_context_rollback.sql (сначала сервер на прежнюю
-- версию, потом откат базы).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0237_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'xtrud_private'
                AND table_name = 'order_ai_classifications'
                AND column_name = 'suggested_new')
     OR to_regprocedure('xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION '0237_already_applied';
  END IF;
  -- Меняемые функции — ровно живые редакции 0236 (прочитано 2026-10-07).
  IF md5(pg_get_functiondef('xtrud_private.ai_classify_catalog()'::regprocedure))
       IS DISTINCT FROM '32ca9e196b09d2f8872fb07a84cdd476'
     OR md5(pg_get_functiondef('xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text)'::regprocedure))
       IS DISTINCT FROM '8aad49a248de1aa1b179d04bc73e0026'
     OR md5(pg_get_functiondef('public.admin_list_ai_category_suggestions(integer)'::regprocedure))
       IS DISTINCT FROM '95107ae47dad62a56db17f26f74d049c' THEN
    RAISE EXCEPTION '0237_live_functions_changed';
  END IF;
  -- Других перегрузок нет (иначе DROP/CREATE ниже дал бы неоднозначность).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE (n.nspname, p.proname) IN (('xtrud_private', 'ai_classify_catalog'),
                                        ('xtrud_private', 'ai_classify_result'),
                                        ('public', 'admin_list_ai_category_suggestions'))) <> 3 THEN
    RAISE EXCEPTION '0237_unexpected_overloads';
  END IF;
  IF to_regclass('public.categories_l3') IS NULL
     OR to_regclass('public.category_terms') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xtrud_api' AND NOT rolinherit) THEN
    RAISE EXCEPTION '0237_dependencies_missing';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Предложение новой подкатегории. Форма и размер проверяются и здесь.
-- ---------------------------------------------------------------------------
ALTER TABLE xtrud_private.order_ai_classifications
  ADD COLUMN suggested_new jsonb
    CHECK (suggested_new IS NULL
           OR (jsonb_typeof(suggested_new) = 'object'
               AND length(suggested_new::text) <= 400));

-- ---------------------------------------------------------------------------
-- Каталог для нейросети.
-- ---------------------------------------------------------------------------
DROP FUNCTION xtrud_private.ai_classify_catalog();

CREATE FUNCTION xtrud_private.ai_classify_catalog()
 RETURNS TABLE(l2_id text, name_ru text, section text, section_id text,
               services text, terms text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id, c.name_ru, l1.name_ru, l1.id,
         coalesce((
           SELECT string_agg(s.name_ru, '; ' ORDER BY s.sort_order, s.id)
             FROM (SELECT l3.name_ru, l3.sort_order, l3.id
                     FROM public.categories_l3 l3
                    WHERE l3.l2_id = c.id AND l3.is_active
                    ORDER BY l3.sort_order, l3.id
                    LIMIT 12) s), ''),
         coalesce((
           SELECT string_agg(t.term, '; ' ORDER BY t.weight DESC, t.term)
             FROM (SELECT d.term, d.weight
                     FROM (SELECT DISTINCT ON (lower(ct.term))
                                  lower(ct.term) AS term, ct.weight
                             FROM public.category_terms ct
                             LEFT JOIN public.categories_l3 l3t ON l3t.id = ct.l3_id
                            WHERE (ct.l2_id = c.id OR (l3t.l2_id = c.id AND l3t.is_active))
                              AND lower(ct.term) <> lower(c.name_ru)
                              AND NOT EXISTS (
                                    SELECT 1 FROM public.categories_l3 l3x
                                     WHERE l3x.l2_id = c.id AND l3x.is_active
                                       AND lower(l3x.name_ru) = lower(ct.term))
                            ORDER BY lower(ct.term), ct.weight DESC) d
                    ORDER BY d.weight DESC, d.term
                    LIMIT 12) t), '')
    FROM public.categories_l2 c
    JOIN public.categories_l1 l1 ON l1.id = c.l1_id
   WHERE c.is_active AND c.is_visible AND c.id <> 'uncategorized'
   ORDER BY l1.sort_order, c.sort_order, c.id;
$function$;

-- ---------------------------------------------------------------------------
-- Результат: тело 0236 + необязательное предложение новой подкатегории.
-- ---------------------------------------------------------------------------
DROP FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text);

CREATE FUNCTION xtrud_private.ai_classify_result(
  p_order_id uuid, p_outcome text, p_l2_id text, p_confidence numeric,
  p_model text, p_error text, p_suggested_new jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_invisible constant text := '[\u0001-\u001F\u007F​-‏‪-‮⁠-⁩﻿]';
  v_row xtrud_private.order_ai_classifications%ROWTYPE;
  v_order_status public.order_status;
  v_order_l2 text;
  v_title text;
  v_live boolean;
  v_known_l2 text;
  v_assignable boolean := false;
  v_status text;
  v_reason text;
  v_notified boolean := false;
  v_new_section text;
  v_new_name text;
  v_suggested_new jsonb;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('assigned', 'unsure', 'failed') THEN
    RAISE EXCEPTION 'bad_outcome' USING errcode = '22023';
  END IF;
  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1) THEN
    RAISE EXCEPTION 'bad_confidence' USING errcode = '22023';
  END IF;

  SELECT * INTO v_row FROM xtrud_private.order_ai_classifications c
   WHERE c.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('applied', false, 'status', v_row.status);
  END IF;

  SELECT o.status, o.l2_id, o.title INTO v_order_status, v_order_l2, v_title
    FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  v_live := FOUND AND v_order_status = 'open' AND v_order_l2 = 'uncategorized'
            AND NOT xtrud_private.order_is_shadow_hidden(p_order_id);

  SELECT c.id INTO v_known_l2 FROM public.categories_l2 c
   WHERE c.id = p_l2_id AND c.id <> 'uncategorized';
  SELECT EXISTS (SELECT 1 FROM public.categories_l2 c
                  WHERE c.id = p_l2_id AND c.is_active AND c.is_visible
                    AND c.id <> 'uncategorized')
    INTO v_assignable;

  IF NOT v_live THEN
    v_status := CASE WHEN p_outcome = 'failed' THEN 'failed' ELSE 'unsure' END;
    v_reason := 'order_changed';
  ELSIF p_outcome = 'assigned' AND v_assignable AND p_confidence IS NOT NULL THEN
    UPDATE public.orders SET l2_id = p_l2_id WHERE id = p_order_id;
    v_status := 'assigned';
    v_reason := 'confident';
  ELSE
    v_status := CASE WHEN p_outcome = 'failed' THEN 'failed' ELSE 'unsure' END;
    v_reason := CASE
      WHEN p_outcome = 'failed' THEN 'error'
      WHEN p_l2_id IS NOT NULL AND NOT v_assignable THEN 'unknown_category'
      ELSE 'low_confidence' END;
    v_notified := xtrud_private.notify_admins_uncategorized(p_order_id);
  END IF;

  -- 0237: предложение новой подкатегории — только при 'unsure' и только
  -- проверенное; кривое молча отбрасывается (итог от него не зависит).
  IF v_status = 'unsure' AND jsonb_typeof(p_suggested_new) = 'object'
     AND jsonb_typeof(p_suggested_new -> 'section_id') = 'string'
     AND jsonb_typeof(p_suggested_new -> 'name') = 'string' THEN
    SELECT l1.id INTO v_new_section FROM public.categories_l1 l1
     WHERE l1.id = p_suggested_new ->> 'section_id';
    v_new_name := btrim(regexp_replace(p_suggested_new ->> 'name', '\s+', ' ', 'g'));
    IF v_new_section IS NOT NULL
       AND length(v_new_name) BETWEEN 2 AND 60
       AND v_new_name !~ c_invisible
       AND v_new_name ~ '[А-Яа-яЁёA-Za-z]'
       -- Те же правила, что у admin_create_category (ревью безопасности
       -- №282): только буквы, цифры и простая пунктуация, без ссылок и
       -- служебных слов, и не телефон (меньше 7 цифр).
       AND v_new_name ~ '^[А-Яа-яЁёA-Za-z0-9 ,.«»()/+–—-]+$'
       AND v_new_name !~* '(https?://|supabase|anon_key|service_role|avg_check|price)'
       AND (SELECT count(*) FROM regexp_matches(v_new_name, '[0-9]', 'g')) < 7 THEN
      v_suggested_new := jsonb_build_object('section_id', v_new_section, 'name', v_new_name);
    END IF;
  END IF;

  UPDATE xtrud_private.order_ai_classifications c
     SET status = v_status,
         suggested_l2 = v_known_l2,
         suggested_new = v_suggested_new,
         confidence = p_confidence,
         model = left(p_model, 80),
         reason = v_reason,
         error = left(p_error, 500),
         title = v_title,
         claimed_at = NULL,
         admins_notified_at = CASE WHEN v_notified THEN now() ELSE c.admins_notified_at END,
         updated_at = now()
   WHERE c.order_id = p_order_id;

  RETURN jsonb_build_object('applied', true, 'status', v_status, 'reason', v_reason,
                            'l2_id', CASE WHEN v_status = 'assigned' THEN p_l2_id END,
                            'admins_notified', v_notified,
                            'suggested_new', v_suggested_new IS NOT NULL);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Админка: подсказки нейросети + предложение новой подкатегории.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.admin_list_ai_category_suggestions(integer);

CREATE FUNCTION public.admin_list_ai_category_suggestions(p_limit integer DEFAULT 50)
 RETURNS TABLE(order_id uuid, order_title text, order_l2 text, suggested_l2 text,
               l2_name text, confidence numeric, status text, reason text,
               model text, updated_at timestamptz, suggested_new jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT c.order_id, o.title, o.l2_id, c.suggested_l2, l2.name_ru, c.confidence,
         c.status, c.reason, c.model, c.updated_at,
         CASE WHEN c.suggested_new IS NULL THEN NULL
              ELSE jsonb_build_object('section_id', c.suggested_new ->> 'section_id',
                                      'name', c.suggested_new ->> 'name',
                                      'section_name', l1.name_ru) END
    FROM xtrud_private.order_ai_classifications c
    JOIN public.orders o ON o.id = c.order_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = c.suggested_l2
    LEFT JOIN public.categories_l1 l1 ON l1.id = c.suggested_new ->> 'section_id'
   ORDER BY (o.l2_id = 'uncategorized' AND o.status = 'open') DESC,
            c.updated_at DESC, c.order_id
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Права — как в 0236 (живые ACL сверены 2026-10-07).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_catalog() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_ai_category_suggestions(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION xtrud_private.ai_classify_catalog() TO xtrud_api;
GRANT EXECUTE ON FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text, jsonb) TO xtrud_api;
GRANT EXECUTE ON FUNCTION public.admin_list_ai_category_suggestions(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Проверки.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_list_ai_category_suggestions(integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_list_ai_category_suggestions(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.admin_list_ai_category_suggestions(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'xtrud_private.ai_classify_catalog()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.ai_classify_catalog()', 'EXECUTE')
     OR has_function_privilege('anon', 'xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('xtrud_api', 'xtrud_private.ai_classify_catalog()', 'EXECUTE')
     OR NOT has_function_privilege('xtrud_api', 'xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('xtrud_api', 'public.admin_list_ai_category_suggestions(integer)', 'EXECUTE')
     OR to_regprocedure('xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text)') IS NOT NULL
     OR has_table_privilege('authenticated', 'xtrud_private.order_ai_classifications', 'SELECT')
     OR has_table_privilege('anon', 'xtrud_private.order_ai_classifications', 'SELECT')
     OR has_table_privilege('xtrud_api', 'xtrud_private.order_ai_classifications', 'SELECT')
     OR (SELECT count(*) FROM xtrud_private.ai_classify_catalog()) = 0 THEN
    RAISE EXCEPTION '0237_postcheck_failed';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
