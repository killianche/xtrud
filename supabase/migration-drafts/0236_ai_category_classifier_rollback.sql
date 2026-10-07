-- Откат 0236 (ИИ-подбор категории). Возвращает триггер
-- xtrud_private.orders_uncategorized_events к живой редакции 0231
-- (md5 db29f8d2728a492548d1d27debca84ec — проверяется после замены) и
-- удаляет всё, что добавила 0236: флаг ai_classify, таблицу подсказок,
-- функции, cron 'ai_classify_sweep', admin_list_ai_category_suggestions.
--
-- Незавершённые задачи (pending) не теряются: до удаления по каждой зовутся
-- админы (как сделал бы старый триггер). Журнал авто-назначений из таблицы
-- удаляется вместе с ней — при необходимости сохранить до отката:
--   \copy (SELECT * FROM xtrud_private.order_ai_classifications) TO 'ai_0236.csv' CSV HEADER
--
-- До отката: снять xtrud-api с ИИ (убрать DEEPSEEK_API_KEY и перезапустить)
-- — иначе сервер будет звать удалённые функции (ошибки в логе, вреда нет).
-- После отката: убрать admin_list_ai_category_suggestions из RPC_ALLOWLIST.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0236_rollback_must_run_as_postgres';
  END IF;
  IF to_regclass('xtrud_private.order_ai_classifications') IS NULL
     OR to_regprocedure('xtrud_private.notify_admins_uncategorized(uuid)') IS NULL THEN
    RAISE EXCEPTION '0236_rollback_not_applied';
  END IF;
END $$;

-- Новые задачи больше не появляются: флаг выключен до разбора pending.
UPDATE public.app_settings SET value = '{"enabled": false}'::jsonb WHERE key = 'ai_classify';

-- Незавершённые — админам (старое поведение), строки блокируются.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT c.order_id FROM xtrud_private.order_ai_classifications c
     WHERE c.status = 'pending'
     ORDER BY c.created_at
     FOR UPDATE
  LOOP
    PERFORM xtrud_private.notify_admins_uncategorized(v_id);
  END LOOP;
END $$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ai_classify_sweep';

-- Живое тело 0231 (снято с базы 2026-10-07).
CREATE OR REPLACE FUNCTION xtrud_private.orders_uncategorized_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid;
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
    -- Волна (больше 20 событий за час) — без push, только в админке:
    -- лимиты публикации ограничивают одного человека, а не всех.
    IF (SELECT count(*) FROM xtrud_private.order_uncategorized_events e
         WHERE e.admin_notified_at > now() - interval '1 hour') > 20 THEN
      RETURN NULL;
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
          left(NEW.title, 80) || ' — откройте админку',
          jsonb_build_object('type', 'system', 'kind', 'uncategorized_order',
                             'uncategorized_order_id', NEW.id));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'uncategorized_order push %: %', NEW.id, SQLERRM;
      END;
    END LOOP;
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

DO $$
BEGIN
  IF md5(pg_get_functiondef('xtrud_private.orders_uncategorized_events()'::regprocedure))
       IS DISTINCT FROM 'db29f8d2728a492548d1d27debca84ec' THEN
    RAISE EXCEPTION '0236_rollback_trigger_body_mismatch';
  END IF;
END $$;

DROP FUNCTION public.admin_list_ai_category_suggestions(integer);
DROP FUNCTION xtrud_private.ai_classify_sweep();
DROP FUNCTION xtrud_private.ai_classify_result(uuid, text, text, numeric, text, text);
DROP FUNCTION xtrud_private.ai_classify_catalog();
DROP FUNCTION xtrud_private.ai_classify_claim();
DROP FUNCTION xtrud_private.notify_admins_uncategorized(uuid);
DROP FUNCTION xtrud_private.ai_classify_enabled();
DROP TABLE xtrud_private.order_ai_classifications;
DELETE FROM public.app_settings WHERE key = 'ai_classify';

NOTIFY pgrst, 'reload schema';

COMMIT;
