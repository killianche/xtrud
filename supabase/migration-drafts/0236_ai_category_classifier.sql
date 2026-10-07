-- 0236: нейросеть подбирает категорию заданию «Без категории» (TASKS №279,
-- 2026-10-07).
--
-- Владелец: «клиент категории не видит. Задание без категории классифицирует
-- нейросеть DeepSeek на сервере xtrud-api: уверена — ставит категорию
-- (мастерам уходит рассылка); сомневается, ошибка, таймаут — админам push
-- „Новое задание без категории“ (как сейчас), подсказка видна в админке».
-- Ключ придёт позже: без него поведение ровно как сейчас.
--
-- Было (0230 + 0231, живая редакция 2026-10-07, md5 db29f8d2…):
--   задание вошло в 'uncategorized' (открыто, не скрыто красным флагом) →
--   один раз на задание push всем активным админам (волна > 20/ч — без push).
--
-- Стало:
--   * app_settings 'ai_classify' = {"enabled": false} — по умолчанию ВЫКЛ.
--     Выключено (или ключа нет/значение испорчено) → ровно как раньше.
--   * Включено → вместо немедленного push: строка pending в
--     xtrud_private.order_ai_classifications и pg_notify('order_ai_classify',
--     order_id). xtrud-api забирает задачу (xtrud_private.ai_classify_claim),
--     спрашивает DeepSeek и пишет результат (xtrud_private.ai_classify_result):
--       - уверенно и категория активная видимая, задание всё ещё открыто и
--         всё ещё 'uncategorized', не скрыто → orders.l2_id := подсказка;
--         рассылку мастерам ставит существующая ветка «ушло из заглушки»
--         (один раз на задание);
--       - не уверена / ошибка / неизвестная категория → push админам тем же
--         кодом, что раньше (xtrud_private.notify_admins_uncategorized);
--       - задание за это время изменили/закрыли/скрыли → ничего не трогаем,
--         без push.
--   * Подстраховка в базе, а не в сервере: pg_cron 'ai_classify_sweep' раз в
--     минуту переводит pending старше 5 минут в failed и зовёт админов. Так
--     флаг, включённый без ключа или при упавшем сервере, не теряет push.
--   * Журнал авто-назначений — сама таблица (status 'assigned', title на
--     момент решения, модель, уверенность). В admin_actions не пишем:
--     admin_id NOT NULL и admin_log_action требует админскую сессию
--     (проверено на живой базе 2026-10-07).
--   * Админка: public.admin_list_ai_category_suggestions(p_limit) —
--     только is_admin_session(); в server/src/rpc/routes.ts RPC_ALLOWLIST.
--
-- Доступ (fail-closed): таблица — без прав anon/authenticated/xtrud_api;
-- функции claim/catalog/result — EXECUTE только xtrud_api (роль сервера,
-- без inherit); notify_admins/sweep/enabled — никому, кроме владельца.
-- Функции лежат в xtrud_private (у postgres нет CREATE в схеме xtrud_api;
-- xtrud_api имеет USAGE на xtrud_private — проверено 2026-10-07).
--
-- Откат: 0236_ai_category_classifier_rollback.sql (сначала зовёт админов по
-- незавершённым pending, затем возвращает живое тело триггера 0231 с
-- проверкой md5 и удаляет всё новое).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0236_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.order_ai_classifications') IS NOT NULL
     OR to_regprocedure('xtrud_private.notify_admins_uncategorized(uuid)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'ai_classify')
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai_classify_sweep') THEN
    RAISE EXCEPTION '0236_already_applied';
  END IF;
  -- Меняемая функция — ровно живая редакция 0231 (прочитано 2026-10-07).
  IF md5(pg_get_functiondef('xtrud_private.orders_uncategorized_events()'::regprocedure))
       IS DISTINCT FROM 'db29f8d2728a492548d1d27debca84ec' THEN
    RAISE EXCEPTION '0236_orders_uncategorized_events_changed';
  END IF;
  -- На эти функции опирается решение (не меняются).
  IF md5(pg_get_functiondef('public.notify_user(uuid,text,text,jsonb)'::regprocedure))
       IS DISTINCT FROM 'c7ceab5165a3dd51b21e508098f63bdc' THEN
    RAISE EXCEPTION '0236_dependency_changed';
  END IF;
  IF to_regprocedure('xtrud_private.order_is_shadow_hidden(uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL
     OR to_regclass('xtrud_private.order_uncategorized_events') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xtrud_api' AND NOT rolinherit)
     OR NOT EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'uncategorized') THEN
    RAISE EXCEPTION '0236_dependencies_missing';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Флаг. По умолчанию выключен.
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES ('ai_classify', '{"enabled": false}'::jsonb);

-- Испорченное значение = выключено (fail-closed к старому поведению).
CREATE FUNCTION xtrud_private.ai_classify_enabled()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT s.value -> 'enabled' = 'true'::jsonb
       FROM public.app_settings s WHERE s.key = 'ai_classify'),
    false);
$function$;

-- ---------------------------------------------------------------------------
-- Таблица подсказок и журнал авто-назначений.
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.order_ai_classifications (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'unsure', 'failed')),
  suggested_l2 text REFERENCES public.categories_l2(id) ON DELETE SET NULL,
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  model text CHECK (model IS NULL OR length(model) <= 80),
  -- Код причины итога: confident | low_confidence | unknown_category |
  -- order_changed | error | stuck. Текст ошибки — отдельно, без секретов.
  reason text CHECK (reason IS NULL OR length(reason) <= 40),
  error text CHECK (error IS NULL OR length(error) <= 500),
  -- Название на момент решения — для разбора качества (как 0235).
  title text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_at timestamptz,
  admins_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE xtrud_private.order_ai_classifications FROM PUBLIC, anon, authenticated;
CREATE INDEX order_ai_classifications_pending_idx
  ON xtrud_private.order_ai_classifications (created_at) WHERE status = 'pending';
CREATE INDEX order_ai_classifications_updated_at_idx
  ON xtrud_private.order_ai_classifications (updated_at DESC);

-- ---------------------------------------------------------------------------
-- Push админам — код из 0230 без изменения поведения (волна > 20/ч — без
-- push). Зовётся из триггера (флаг выключен) и из результата нейросети.
-- Задание должно быть открыто, в заглушке и не скрыто — иначе молчим.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.notify_admins_uncategorized(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid;
  v_title text;
BEGIN
  SELECT o.title INTO v_title FROM public.orders o
   WHERE o.id = p_order_id AND o.status = 'open' AND o.l2_id = 'uncategorized';
  IF NOT FOUND OR xtrud_private.order_is_shadow_hidden(p_order_id) THEN
    RETURN false;
  END IF;
  -- Волна (больше 20 событий за час) — без push, только в админке:
  -- лимиты публикации ограничивают одного человека, а не всех.
  IF (SELECT count(*) FROM xtrud_private.order_uncategorized_events e
       WHERE e.admin_notified_at > now() - interval '1 hour') > 20 THEN
    RETURN false;
  END IF;
  FOR v_admin IN
    SELECT u.id FROM public.users u
     WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active'
  LOOP
    BEGIN
      -- Без ключа order_id: он включил бы задание в счётчики «моих
      -- заданий» админа (use-notifications.ts считает строки с order_id).
      PERFORM public.notify_user(
        v_admin,
        'Новое задание без категории',
        left(v_title, 80) || ' — откройте админку',
        jsonb_build_object('type', 'system', 'kind', 'uncategorized_order',
                           'uncategorized_order_id', p_order_id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'uncategorized_order push %: %', p_order_id, SQLERRM;
    END;
  END LOOP;
  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Триггер: живое тело 0231, изменена только ветка «вошло в заглушку».
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION xtrud_private.orders_uncategorized_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows int;
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NULL;
  END IF;
  -- 0231: скрытое красным флагом — ни push админам, ни рассылки.
  IF xtrud_private.order_is_shadow_hidden(NEW.id) THEN
    RETURN NULL;
  END IF;

  IF NEW.l2_id = 'uncategorized'
     AND (TG_OP = 'INSERT' OR OLD.l2_id IS DISTINCT FROM 'uncategorized') THEN
    INSERT INTO xtrud_private.order_uncategorized_events (order_id)
    VALUES (NEW.id)
    ON CONFLICT (order_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RETURN NULL;  -- по этому заданию админов уже звали
    END IF;
    -- 0236: включена нейросеть — сначала она, админы — если не уверена.
    IF xtrud_private.ai_classify_enabled() THEN
      INSERT INTO xtrud_private.order_ai_classifications (order_id)
      VALUES (NEW.id)
      ON CONFLICT (order_id) DO NOTHING;
      PERFORM pg_notify('order_ai_classify', NEW.id::text);
      RETURN NULL;
    END IF;
    PERFORM xtrud_private.notify_admins_uncategorized(NEW.id);
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.l2_id = 'uncategorized'
     AND NEW.l2_id IS DISTINCT FROM 'uncategorized' THEN
    INSERT INTO xtrud_private.order_uncategorized_events AS e (order_id, rebroadcast_at)
    VALUES (NEW.id, now())
    ON CONFLICT (order_id) DO UPDATE SET rebroadcast_at = now()
      WHERE e.rebroadcast_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.order_broadcast_queue (order_id) VALUES (NEW.id)
      ON CONFLICT (order_id) DO UPDATE SET attempts = 0, queued_at = now();
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Сервер: взять задачу. Одна строка pending (attempts < 3; взятая, но без
-- результата дольше 60 с — снова доступна), задание всё ещё открыто и в
-- заглушке, не скрыто «красным флагом» (0231).
-- В нейросеть уходит ТОЛЬКО название (ревью безопасности №279: описание может
-- содержать имя, адрес, телефон, а политика конфиденциальности обещает не
-- передавать персональные данные за рубеж) — описание серверу не отдаётся.
-- Потолок расходов (там же): не больше 60 заданий в час и 300 в сутки на всех
-- и 5 в час от одного клиента; сверх — задание ждёт, и через 5 минут
-- подстраховка (ai_classify_sweep) отдаёт его админам, как без нейросети.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.ai_classify_claim()
 RETURNS TABLE(order_id uuid, title text, description text, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF (SELECT count(*) FROM xtrud_private.order_ai_classifications c
       WHERE c.claimed_at > now() - interval '1 hour') >= 60
     OR (SELECT count(*) FROM xtrud_private.order_ai_classifications c
          WHERE c.claimed_at > now() - interval '1 day') >= 300 THEN
    RETURN;
  END IF;
  SELECT c.order_id INTO v_id
    FROM xtrud_private.order_ai_classifications c
    JOIN public.orders o ON o.id = c.order_id
   WHERE c.status = 'pending'
     AND c.attempts < 3
     AND c.created_at <= now()
     AND (c.claimed_at IS NULL OR c.claimed_at < now() - interval '60 seconds')
     AND o.status = 'open'
     AND o.l2_id = 'uncategorized'
     AND NOT xtrud_private.order_is_shadow_hidden(o.id)
     AND (SELECT count(*) FROM xtrud_private.order_ai_classifications c2
            JOIN public.orders o2 ON o2.id = c2.order_id
           WHERE o2.client_id = o.client_id
             AND c2.claimed_at > now() - interval '1 hour') < 5
   ORDER BY c.created_at
   LIMIT 1
   FOR UPDATE OF c SKIP LOCKED;
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE xtrud_private.order_ai_classifications c
     SET attempts = c.attempts + 1, claimed_at = now(), updated_at = now()
   WHERE c.order_id = v_id;
  RETURN QUERY
  SELECT o.id, o.title, ''::text, c.attempts
    FROM public.orders o
    JOIN xtrud_private.order_ai_classifications c ON c.order_id = o.id
   WHERE o.id = v_id;
END;
$function$;

-- Сервер: подкатегории, из которых выбирает нейросеть (активные видимые,
-- без заглушки).
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

-- ---------------------------------------------------------------------------
-- Сервер: результат. p_outcome — 'assigned' (сервер уверен: confidence ≥
-- порога и id из списка), 'unsure' или 'failed'. База перепроверяет всё,
-- что может: категория, состояние задания, повторная запись.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Подстраховка (pg_cron, раз в минуту): pending старше 5 минут → failed и
-- админам. Работает и без сервера/ключа.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.ai_classify_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_n integer := 0;
  v_notified boolean;
BEGIN
  FOR v_id IN
    SELECT c.order_id FROM xtrud_private.order_ai_classifications c
     WHERE c.status = 'pending' AND c.created_at < now() - interval '5 minutes'
     ORDER BY c.created_at
     LIMIT 100
     FOR UPDATE SKIP LOCKED
  LOOP
    v_notified := xtrud_private.notify_admins_uncategorized(v_id);
    UPDATE xtrud_private.order_ai_classifications c
       SET status = 'failed', reason = 'stuck', claimed_at = NULL,
           admins_notified_at = CASE WHEN v_notified THEN now() ELSE c.admins_notified_at END,
           updated_at = now()
     WHERE c.order_id = v_id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Админка: подсказки нейросети. Без описания и контактов.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Права.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.notify_admins_uncategorized(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_claim() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_catalog() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION xtrud_private.ai_classify_sweep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_ai_category_suggestions(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION xtrud_private.ai_classify_claim() TO xtrud_api;
GRANT EXECUTE ON FUNCTION xtrud_private.ai_classify_catalog() TO xtrud_api;
GRANT EXECUTE ON FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text) TO xtrud_api;
GRANT EXECUTE ON FUNCTION public.admin_list_ai_category_suggestions(integer) TO authenticated, service_role;

SELECT cron.schedule('ai_classify_sweep', '* * * * *', 'SELECT xtrud_private.ai_classify_sweep();');

-- ---------------------------------------------------------------------------
-- Проверки.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_list_ai_category_suggestions(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.ai_classify_claim()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.notify_admins_uncategorized(uuid)', 'EXECUTE')
     OR has_function_privilege('xtrud_api', 'xtrud_private.notify_admins_uncategorized(uuid)', 'EXECUTE')
     OR has_function_privilege('xtrud_api', 'xtrud_private.ai_classify_sweep()', 'EXECUTE')
     OR has_table_privilege('authenticated', 'xtrud_private.order_ai_classifications', 'SELECT')
     OR has_table_privilege('anon', 'xtrud_private.order_ai_classifications', 'SELECT')
     OR has_table_privilege('xtrud_api', 'xtrud_private.order_ai_classifications', 'SELECT')
     OR NOT has_function_privilege('xtrud_api', 'xtrud_private.ai_classify_claim()', 'EXECUTE')
     OR NOT has_function_privilege('xtrud_api', 'xtrud_private.ai_classify_result(uuid,text,text,numeric,text,text)', 'EXECUTE')
     OR xtrud_private.ai_classify_enabled() THEN
    RAISE EXCEPTION '0236_postcheck_failed';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
