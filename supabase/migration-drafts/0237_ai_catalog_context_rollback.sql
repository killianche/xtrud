-- Откат 0237 (каталог для нейросети и предложение новой подкатегории).
-- Возвращает ai_classify_catalog, ai_classify_result (6 аргументов) и
-- admin_list_ai_category_suggestions к живым редакциям 0236 (тела взяты из
-- 0236_ai_category_classifier.sql; md5 после замены сверяется с живыми
-- значениями до 0237) и удаляет колонку suggested_new.
--
-- Теряется: предложения новых подкатегорий (suggested_new). Сохранить до
-- отката при необходимости:
--   \copy (SELECT order_id, suggested_new FROM xtrud_private.order_ai_classifications WHERE suggested_new IS NOT NULL) TO 'ai_0237.csv' CSV HEADER
--
-- До отката: вернуть xtrud-api на версию без 0237 (или убрать
-- DEEPSEEK_API_KEY и перезапустить). Новый сервер переживает и старую базу
-- (каталог читает через SELECT *, седьмой аргумент шлёт только при
-- предложении), но предложение тогда не запишется — задача станет failed и
-- уйдёт админам, как при любой ошибке.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0237_rollback_must_run_as_postgres';
  END IF;
  IF to_regprocedure('xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION '0237_rollback_not_applied';
  END IF;
  -- Откатываем ровно то, что поставила 0237 (md5 из репетиции 2026-10-07).
  IF md5(pg_get_functiondef('xtrud_private.ai_classify_catalog()'::regprocedure))
       IS DISTINCT FROM '819ddddbb3ca1dd339d9f3ccf856914b'
     OR md5(pg_get_functiondef('xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text,jsonb)'::regprocedure))
       IS DISTINCT FROM '42840552297524ee966c14415e5f3618'
     OR md5(pg_get_functiondef('public.admin_list_ai_category_suggestions(integer)'::regprocedure))
       IS DISTINCT FROM '0973ae2ce60adebe3c40dd989d754e49' THEN
    RAISE EXCEPTION '0237_rollback_functions_changed';
  END IF;
END $$;

DROP FUNCTION xtrud_private.ai_classify_catalog();
DROP FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text, jsonb);
DROP FUNCTION public.admin_list_ai_category_suggestions(integer);

-- Тела 0236 без изменений.
CREATE FUNCTION xtrud_private.ai_classify_catalog()
 RETURNS TABLE(l2_id text, name_ru text, section text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id, c.name_ru, l1.name_ru
    FROM public.categories_l2 c
    JOIN public.categories_l1 l1 ON l1.id = c.l1_id
   WHERE c.is_active AND c.is_visible AND c.id <> 'uncategorized'
   ORDER BY l1.sort_order, c.sort_order, c.id;
$function$;

CREATE FUNCTION xtrud_private.ai_classify_result(
  p_order_id uuid, p_outcome text, p_l2_id text, p_confidence numeric,
  p_model text, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
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

  UPDATE xtrud_private.order_ai_classifications c
     SET status = v_status,
         suggested_l2 = v_known_l2,
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
                            'admins_notified', v_notified);
END;
$function$;

CREATE FUNCTION public.admin_list_ai_category_suggestions(p_limit integer DEFAULT 50)
 RETURNS TABLE(order_id uuid, order_title text, order_l2 text, suggested_l2 text,
               l2_name text, confidence numeric, status text, reason text,
               model text, updated_at timestamptz)
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
         c.status, c.reason, c.model, c.updated_at
    FROM xtrud_private.order_ai_classifications c
    JOIN public.orders o ON o.id = c.order_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = c.suggested_l2
   ORDER BY (o.l2_id = 'uncategorized' AND o.status = 'open') DESC,
            c.updated_at DESC, c.order_id
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END;
$function$;

ALTER TABLE xtrud_private.order_ai_classifications DROP COLUMN suggested_new;

REVOKE ALL ON FUNCTION xtrud_private.ai_classify_catalog() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_ai_category_suggestions(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION xtrud_private.ai_classify_catalog() TO xtrud_api;
GRANT EXECUTE ON FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text) TO xtrud_api;
GRANT EXECUTE ON FUNCTION public.admin_list_ai_category_suggestions(integer) TO authenticated, service_role;

DO $$
BEGIN
  IF md5(pg_get_functiondef('xtrud_private.ai_classify_catalog()'::regprocedure))
       IS DISTINCT FROM '32ca9e196b09d2f8872fb07a84cdd476'
     OR md5(pg_get_functiondef('xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text)'::regprocedure))
       IS DISTINCT FROM '8aad49a248de1aa1b179d04bc73e0026'
     OR md5(pg_get_functiondef('public.admin_list_ai_category_suggestions(integer)'::regprocedure))
       IS DISTINCT FROM '95107ae47dad62a56db17f26f74d049c'
     OR has_function_privilege('anon', 'public.admin_list_ai_category_suggestions(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.ai_classify_catalog()', 'EXECUTE')
     OR NOT has_function_privilege('xtrud_api', 'xtrud_private.ai_classify_catalog()', 'EXECUTE')
     OR NOT has_function_privilege('xtrud_api', 'xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_list_ai_category_suggestions(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '0237_rollback_postcheck_failed';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
