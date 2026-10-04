-- 0216: флаг плиток «Найти задание» и рассылка push всем из админки.
--
-- Решение владельца 2026-10-04.
--
-- A) Плитки «Найти задание».
--    Было: get_app_flags() отдаёт только find_screen; вида плиток нет.
--    Стало: app_settings.find_tiles = {"variant": "mosaic" | "grid"};
--    get_app_flags() отдаёт find_screen (как было — его читают старые сборки)
--    и find_tiles (нет ключа или чужое значение → 'grid', прежний вид);
--    admin_set_find_tiles(p_variant) — переключатель, как admin_set_find_screen.
--    Старые сборки лишний ключ игнорируют.
--
-- B) Рассылка push всем.
--    Было: в админке нет способа написать всем пользователям.
--    Стало:
--      xtrud_private.broadcasts — история рассылок (ролям API доступа нет,
--        RLS без политик);
--      xtrud_private.broadcast_recipients(audience) — кто получит (одно
--        правило для предпросмотра и отправки; ролям API доступа нет);
--      admin_broadcast_preview(p_audience)            → {recipients, with_push};
--      admin_broadcast_push(p_title, p_body, p_audience) → {id, recipients};
--      admin_list_broadcasts(p_limit)                 — последние рассылки.
--    Получатели: public.users со status = 'active' и NOT is_demo (то же
--    правило «живого» аккаунта, что в is_admin_session); удалённые
--    (status = 'deleted'), приостановленные и заблокированные — нет.
--    Админы входят: они тоже пользователи и видят, что ушло.
--    «Специалист» = master_profiles.status = 'active' (FACT, try_publish_master:
--    профиль с хотя бы одной категорией, виден в каталоге). users.is_master
--    для этого не годится: на 2026-10-04 он true у всех активных
--    пользователей. 'clients' = все остальные (без активного профиля);
--    clients ∪ masters = all, пересечения нет.
--    Отписки нет: таблиц/колонок настроек уведомлений в базе нет (FACT,
--    information_schema 2026-10-04) — единственный «выключатель» — системное
--    разрешение iOS/Android (нет токена — нет push; запись в «Уведомлениях»
--    появляется у всех получателей).
--    Лимит на площадку: не чаще 1 рассылки в 10 минут и не больше 5 за
--    скользящие 24 часа; одновременные отправки двух админов
--    сериализуются транзакционной advisory-блокировкой.
--    Каждому получателю — public.notify_user(uid, title, body,
--    {"type":"system","kind":"broadcast","broadcast_id":…}): запись в
--    «Уведомления» + запрос в очередь pg_net (уходит только после COMMIT).
--
-- C) Журнал admin_actions: новые действия set_find_tiles, broadcast_push
--    (target_type 'settings', нулевой uuid — как set_find_screen).
--
-- Откат: 0216_broadcast_and_tiles_rollback.sql (история рассылок удаляется).
-- Применять от postgres (не суперпользователя): psql -v ON_ERROR_STOP=1 -q.
-- Перед применением: pg_dump -n public -n xtrud_api -n xtrud_private -Fc > /opt/xtrud/backups/pre-0216-<ts>.dump
-- После применения: добавить новые имена в server/src/rpc/routes.ts RPC_ALLOWLIST.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0216_must_run_as_postgres';
  END IF;
  IF to_regprocedure('public.admin_set_find_tiles(text)') IS NOT NULL
     OR to_regclass('xtrud_private.broadcasts') IS NOT NULL THEN
    RAISE EXCEPTION '0216_already_applied';
  END IF;
  -- Журнал — ровно живой список на 2026-10-04 (после 0215).
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM '4cc6940e395b148e3ff689b9102a09a3' THEN
    RAISE EXCEPTION '0216_admin_actions_action_check_changed';
  END IF;
  -- target_type 'settings' уже разрешён (редакция 0215).
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_target_type_check')
     IS DISTINCT FROM '55147bfd4ed8310cecd9e0ac86e98e69' THEN
    RAISE EXCEPTION '0216_admin_actions_target_type_check_changed';
  END IF;
  -- get_app_flags — ровно тело 0205 (откат 0216 возвращает его же).
  IF md5(pg_get_functiondef('public.get_app_flags()'::regprocedure))
     IS DISTINCT FROM '1d68d92ad2a6a90af367aa038984ed8f' THEN
    RAISE EXCEPTION '0216_get_app_flags_changed';
  END IF;
  IF to_regprocedure('public.notify_user(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.admin_log_action(text,text,uuid,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL
     OR to_regclass('public.notification_tokens') IS NULL
     OR to_regclass('public.master_profiles') IS NULL
     OR to_regnamespace('xtrud_private') IS NULL THEN
    RAISE EXCEPTION '0216_dependency_missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- C. Журнал: живой список 2026-10-04 + новые значения.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show', 'category_hide',
  'set_find_tiles', 'broadcast_push'
]::text[]));

-- ---------------------------------------------------------------------------
-- A. Плитки «Найти задание».
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value)
VALUES ('find_tiles', '{"variant": "mosaic"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Флаги интерфейса для приложения: только безопасные для всех ключи.
-- CREATE OR REPLACE сохраняет гранты (anon, authenticated, service_role).
CREATE OR REPLACE FUNCTION public.get_app_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'find_screen',
    coalesce((SELECT value->>'variant' FROM public.app_settings WHERE key = 'find_screen'), 'category_first'),
    'find_tiles',
    coalesce((SELECT s.value->>'variant' FROM public.app_settings s
               WHERE s.key = 'find_tiles' AND s.value->>'variant' IN ('mosaic', 'grid')), 'grid')
  );
$$;

CREATE FUNCTION public.admin_set_find_tiles(p_variant text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_variant IS NULL OR p_variant NOT IN ('mosaic', 'grid') THEN
    RAISE EXCEPTION 'Неизвестный вид плиток.' USING ERRCODE = '22023', DETAIL = 'bad_variant';
  END IF;
  SELECT value->>'variant' INTO v_old FROM public.app_settings WHERE key = 'find_tiles';
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('find_tiles', jsonb_build_object('variant', p_variant), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  PERFORM public.admin_log_action(
    'set_find_tiles', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    'Вид плиток «Найти задание»', NULL,
    jsonb_build_object('old', v_old, 'new', p_variant));
  RETURN public.get_app_flags();
END;
$$;

-- ---------------------------------------------------------------------------
-- B. Рассылка push.
-- ---------------------------------------------------------------------------
CREATE TABLE xtrud_private.broadcasts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 3 AND 60),
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 3 AND 200),
  audience    text        NOT NULL CHECK (audience IN ('all', 'clients', 'masters')),
  recipients  integer     NOT NULL CHECK (recipients >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.users (id) ON DELETE SET NULL
);
CREATE INDEX broadcasts_created_at ON xtrud_private.broadcasts (created_at DESC);
REVOKE ALL ON xtrud_private.broadcasts FROM PUBLIC, anon, authenticated, service_role, xtrud_api;
-- RLS без политик: случайный грант в будущем доступа не откроет.
ALTER TABLE xtrud_private.broadcasts ENABLE ROW LEVEL SECURITY;

-- Кто получит рассылку. Зовётся только из SECURITY DEFINER-функций ниже
-- (от владельца postgres); ролям API EXECUTE не выдаётся. Неизвестная
-- аудитория даёт пустой список (проверка значения — в вызывающих функциях).
CREATE FUNCTION xtrud_private.broadcast_recipients(p_audience text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT u.id
    FROM public.users u
   WHERE u.status = 'active'
     AND NOT u.is_demo
     AND CASE p_audience
           WHEN 'all' THEN true
           WHEN 'masters' THEN EXISTS (SELECT 1 FROM public.master_profiles m
                                        WHERE m.user_id = u.id AND m.status = 'active')
           WHEN 'clients' THEN NOT EXISTS (SELECT 1 FROM public.master_profiles m
                                            WHERE m.user_id = u.id AND m.status = 'active')
           ELSE false
         END;
$$;
REVOKE ALL ON FUNCTION xtrud_private.broadcast_recipients(text) FROM PUBLIC, anon, authenticated, service_role, xtrud_api;

CREATE FUNCTION public.admin_broadcast_preview(p_audience text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_recipients int;
  v_with_push int;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('all', 'clients', 'masters') THEN
    RAISE EXCEPTION 'bad_audience' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.notification_tokens t
                                         WHERE t.user_id = r.uid))::int
    INTO v_recipients, v_with_push
    FROM xtrud_private.broadcast_recipients(p_audience) AS r(uid);

  RETURN jsonb_build_object('recipients', v_recipients, 'with_push', v_with_push);
END;
$$;

CREATE FUNCTION public.admin_broadcast_push(p_title text, p_body text, p_audience text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_title text := btrim(coalesce(p_title, ''));
  v_body  text := btrim(coalesce(p_body, ''));
  v_last  timestamptz;
  v_day   int;
  v_ids   uuid[];
  v_n     int;
  v_id    uuid;
  v_uid   uuid;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('all', 'clients', 'masters') THEN
    RAISE EXCEPTION 'bad_audience' USING ERRCODE = '22023';
  END IF;
  -- Заголовок — одна строка; в тексте допустим только перенос строки.
  IF char_length(v_title) NOT BETWEEN 3 AND 60 OR v_title ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'bad_title' USING ERRCODE = '22023',
      HINT = 'Заголовок — от 3 до 60 символов, одной строкой.';
  END IF;
  IF char_length(v_body) NOT BETWEEN 3 AND 200 OR v_body ~ '[\x01-\x09\x0b-\x1f\x7f]' THEN
    RAISE EXCEPTION 'bad_body' USING ERRCODE = '22023',
      HINT = 'Текст — от 3 до 200 символов.';
  END IF;

  -- Две отправки одновременно (два админа, двойное нажатие) идут по очереди:
  -- вторая увидит запись первой и упрётся в лимит.
  PERFORM pg_advisory_xact_lock(hashtextextended('xtrud_private.broadcasts', 0));

  SELECT max(b.created_at), count(*) FILTER (WHERE b.created_at > now() - interval '24 hours')
    INTO v_last, v_day
    FROM xtrud_private.broadcasts b
   WHERE b.created_at > now() - interval '24 hours';
  IF v_last IS NOT NULL AND v_last > now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'broadcast_too_soon' USING ERRCODE = 'P0001',
      DETAIL = format('retry_after_seconds=%s',
                      ceil(extract(epoch FROM (v_last + interval '10 minutes' - now())))::int),
      HINT = 'Не чаще одной рассылки в 10 минут.';
  END IF;
  IF v_day >= 5 THEN
    RAISE EXCEPTION 'broadcast_daily_limit' USING ERRCODE = 'P0001',
      HINT = 'Не больше 5 рассылок за 24 часа.';
  END IF;

  v_ids := ARRAY(SELECT r.uid FROM xtrud_private.broadcast_recipients(p_audience) AS r(uid));
  v_n := coalesce(cardinality(v_ids), 0);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'broadcast_no_recipients' USING ERRCODE = '22023';
  END IF;

  INSERT INTO xtrud_private.broadcasts (title, body, audience, recipients, created_by)
  VALUES (v_title, v_body, p_audience, v_n, auth.uid())
  RETURNING id INTO v_id;

  -- Запись в «Уведомления» и запрос в очередь pg_net на каждого; сеть
  -- трогается только после COMMIT (воркер pg_net читает закоммиченную очередь).
  FOREACH v_uid IN ARRAY v_ids LOOP
    PERFORM public.notify_user(
      v_uid, v_title, v_body,
      jsonb_build_object('type', 'system', 'kind', 'broadcast', 'broadcast_id', v_id));
  END LOOP;

  PERFORM public.admin_log_action(
    'broadcast_push', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    'Рассылка push', NULL,
    jsonb_build_object('broadcast_id', v_id, 'audience', p_audience, 'recipients', v_n));

  RETURN jsonb_build_object('id', v_id, 'recipients', v_n);
END;
$$;

CREATE FUNCTION public.admin_list_broadcasts(p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, created_at timestamptz, title text, body text, audience text,
              recipients integer, created_by_label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'bad_limit' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.id, b.created_at, b.title, b.body, b.audience, b.recipients,
         coalesce(u.username, nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''))
    FROM xtrud_private.broadcasts b
    LEFT JOIN public.users u ON u.id = b.created_by
   ORDER BY b.created_at DESC
   LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- Гранты: гость — нет; вошедший — да (проверка админа внутри); service_role — да.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_set_find_tiles(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_broadcast_preview(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_broadcast_push(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_broadcasts(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_find_tiles(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_preview(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_push(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_broadcasts(integer) TO authenticated, service_role;

-- Проверки после изменений.
DO $$
DECLARE
  v_fn regprocedure;
  v_role text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.admin_set_find_tiles(text)',
    'public.admin_broadcast_preview(text)',
    'public.admin_broadcast_push(text,text,text)',
    'public.admin_list_broadcasts(integer)'
  ]::regprocedure[]
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0216_anon_can_execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '0216_authenticated_cannot_execute %', v_fn;
    END IF;
    IF NOT (SELECT p.prosecdef
                   AND p.proconfig @> ARRAY['search_path=public, pg_temp']
                   AND p.prosrc LIKE '%IF NOT public.is_admin_session() THEN%'
              FROM pg_proc p WHERE p.oid = v_fn) THEN
      RAISE EXCEPTION '0216_function_not_guarded %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'xtrud_api'] LOOP
    IF has_table_privilege(v_role, 'xtrud_private.broadcasts', 'SELECT')
       OR has_table_privilege(v_role, 'xtrud_private.broadcasts', 'INSERT')
       OR has_table_privilege(v_role, 'xtrud_private.broadcasts', 'UPDATE')
       OR has_table_privilege(v_role, 'xtrud_private.broadcasts', 'DELETE')
       OR has_function_privilege(v_role, 'xtrud_private.broadcast_recipients(text)', 'EXECUTE') THEN
      RAISE EXCEPTION '0216_private_object_exposed_to %', v_role;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'xtrud_private.broadcasts'::regclass) THEN
    RAISE EXCEPTION '0216_broadcasts_rls_off';
  END IF;

  -- get_app_flags: гость читает, оба ключа на месте.
  IF NOT has_function_privilege('anon', 'public.get_app_flags()', 'EXECUTE') THEN
    RAISE EXCEPTION '0216_get_app_flags_lost_anon';
  END IF;
  IF NOT (public.get_app_flags() ? 'find_screen' AND public.get_app_flags() ? 'find_tiles') THEN
    RAISE EXCEPTION '0216_get_app_flags_keys';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
