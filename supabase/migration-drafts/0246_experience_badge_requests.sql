-- 0246: заявка на значок «Большой опыт» и push админам о заявках на значки
-- (№318, 2026-10-08).
--
-- Владелец, 2026-10-08: «значок „компания или мастер опытный“ — чтобы можно
-- было отправить нам запрос на такой значок, мы вручную поговорили и
-- проверили и выдали значок». Компания подаёт заявку с 0245; мастеру значок
-- «Большой опыт» (0225) выдавался только по инициативе админа.
--
-- Было (FACT, живой снимок 2026-10-08):
--   * master_profiles.experience_badge_at — значок; пишет только
--     admin_set_experience_badge (у authenticated нет UPDATE на столбец);
--   * о заявке компании (company_verifications) админ узнаёт, только
--     открыв раздел «Компании»;
--   * admin_actions_action_check — список 0245 (md5 f23016b5…);
--   * delete_my_account — тело после 0245 (md5 prosrc a4cf4e35…).
--
-- Стало:
--   * public.experience_badge_requests — одна заявка на человека: «об опыте»
--     (20–1000 символов) и WhatsApp для связи с администратором. Ролям API
--     таблица недоступна вовсе — только функции ниже.
--   * submit_experience_badge_request, my_experience_badge_request —
--     специалисту; admin_list_experience_badge_requests,
--     admin_review_experience_badge_request — только админу
--     (is_admin_session): WhatsApp — персональные данные (STAFF_ROLES §2).
--     Одобрение ставит experience_badge_at, журнал 'experience_badge_grant'
--     (как ручная выдача), отказ — 'experience_badge_reject'.
--   * Снять значок — прежняя admin_set_experience_badge; после снятия
--     специалист может подать заявку снова (статус считается от значка).
--   * Push админам о новой заявке — триггеры на company_verifications и
--     experience_badge_requests (без ПДн в тексте, демо-аккаунты молчат;
--     подача ограничена 5 в сутки функциями подачи).
--   * delete_my_account: + стирает заявку и значок «Большой опыт»
--     (живое тело, две точечные вставки, md5 до и после сверяются).
--
-- Ревью xtrud-security 2026-10-08 (учтено): В1 — класс невидимых символов
--   только ASCII-кодами, + bidi U+2066–206F, C1, U+00AD/061C/180E; М1 — 20
--   видимых символов; М2 — предел входа до регулярок; М3 — push одному админу
--   не чаще раза в 10 минут; М5 — md5 и search_path нового delete_my_account;
--   М6 — предпроверка INSERT. Хранение WhatsApp после решения — как в 0245
--   (минимизация — отдельным решением владельца).
--
-- Откат: 0246_experience_badge_requests_rollback.sql.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0246_must_run_as_postgres';
  END IF;
  IF to_regclass('public.experience_badge_requests') IS NOT NULL THEN
    RAISE EXCEPTION '0246_already_applied';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conname = 'admin_actions_action_check' AND conrelid = 'public.admin_actions'::regclass)
     IS DISTINCT FROM 'f23016b553eb123e38ebe8e764c010a8' THEN
    RAISE EXCEPTION '0246_action_check_changed';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
     IS DISTINCT FROM 'a4cf4e35ca1bb95e1d84924bf66c188d' THEN
    RAISE EXCEPTION '0246_delete_my_account_changed';
  END IF;
  IF to_regprocedure('public.admin_set_experience_badge(uuid,boolean,text)') IS NULL
     OR to_regprocedure('xtrud_private.normalize_instagram(text)') IS NULL THEN
    RAISE EXCEPTION '0246_missing_dependency';
  END IF;
  IF has_column_privilege('authenticated', 'public.master_profiles', 'experience_badge_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_profiles', 'experience_badge_at', 'INSERT') THEN
    RAISE EXCEPTION '0246_unexpected_master_profiles_grants';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Заявки. revision — редакция, которую видел админ (как в 0245);
--    day_window_start / day_submissions — не больше 5 подач за 24 часа.
-- ---------------------------------------------------------------------------
CREATE TABLE public.experience_badge_requests (
  user_id          uuid        PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  about            text        NOT NULL CHECK (char_length(about) BETWEEN 20 AND 1000),
  whatsapp         text        NOT NULL CHECK (whatsapp ~ '^[0-9]{10,15}$'),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid        REFERENCES public.users (id) ON DELETE SET NULL,
  rejection_reason text        CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 300),
  revision         integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  day_window_start timestamptz NOT NULL DEFAULT now(),
  day_submissions  smallint    NOT NULL DEFAULT 1 CHECK (day_submissions >= 0)
);
CREATE INDEX experience_badge_requests_status_idx
  ON public.experience_badge_requests (status, submitted_at);
COMMENT ON TABLE public.experience_badge_requests IS
  'Заявки на значок «Большой опыт» (0246). Пишут только submit_experience_badge_request, admin_review_experience_badge_request и delete_my_account.';

ALTER TABLE public.experience_badge_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experience_badge_requests FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Состояние для специалиста. Статус считается от значка: значок есть —
--    'approved' (в т.ч. выданный вручную); сняли — можно подать снова.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.experience_badge_state(p_uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'status', CASE WHEN m.experience_badge_at IS NOT NULL THEN 'approved'
                   WHEN r.status IN ('pending', 'rejected') THEN r.status
                   ELSE 'none' END,
    'about',        CASE WHEN m.experience_badge_at IS NULL AND r.status IN ('pending', 'rejected') THEN r.about END,
    'whatsapp',     CASE WHEN m.experience_badge_at IS NULL AND r.status IN ('pending', 'rejected') THEN r.whatsapp END,
    'reason',       CASE WHEN m.experience_badge_at IS NULL AND r.status = 'rejected' THEN r.rejection_reason END,
    'submitted_at', CASE WHEN m.experience_badge_at IS NULL AND r.status IN ('pending', 'rejected') THEN r.submitted_at END,
    'granted_at',   m.experience_badge_at)
    FROM public.master_profiles m
    LEFT JOIN public.experience_badge_requests r ON r.user_id = m.user_id
   WHERE m.user_id = p_uid;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.experience_badge_state(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Специалист.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.submit_experience_badge_request(p_about text, p_whatsapp text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_about text;
  v_wa    text;
  v_req   public.experience_badge_requests%ROWTYPE;
  v_badge timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.status = 'active') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  SELECT m.experience_badge_at INTO v_badge
    FROM public.master_profiles m WHERE m.user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;
  IF v_badge IS NOT NULL THEN
    RAISE EXCEPTION 'already_granted' USING errcode = 'P0001';
  END IF;
  -- Предел входа до регулярных выражений (ревью 0246 М2).
  IF char_length(coalesce(p_about, '')) > 4000 THEN
    RAISE EXCEPTION 'bad_about' USING errcode = '22023';
  END IF;
  IF char_length(coalesce(p_whatsapp, '')) > 64 THEN
    RAISE EXCEPTION 'bad_whatsapp' USING errcode = '22023';
  END IF;
  -- Невидимые, управляющие и bidi-символы — вон (кроме перевода строки;
  -- ревью 0246 В1: только ASCII-запись кодов), больше двух переводов строки
  -- подряд — в два, пробелы по краям — тоже.
  v_about := regexp_replace(coalesce(p_about, ''), '[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]', '', 'g');
  v_about := regexp_replace(v_about, E'\n{3,}', E'\n\n', 'g');
  v_about := btrim(v_about, E' \n\t');
  v_wa := regexp_replace(coalesce(p_whatsapp, ''), '[\s()+-]', '', 'g');
  -- 20 видимых символов, а не 20 пробелов (ревью 0246 М1).
  IF char_length(regexp_replace(v_about, '[[:space:]]', '', 'g')) < 20
     OR char_length(v_about) > 1000 THEN
    RAISE EXCEPTION 'bad_about' USING errcode = '22023';
  END IF;
  IF v_wa !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'bad_whatsapp' USING errcode = '22023';
  END IF;

  SELECT * INTO v_req FROM public.experience_badge_requests r WHERE r.user_id = v_uid FOR UPDATE;
  IF FOUND THEN
    -- Та же заявка уже на проверке (повторное нажатие) — без изменений.
    IF v_req.status = 'pending' AND v_req.about = v_about AND v_req.whatsapp = v_wa THEN
      RETURN xtrud_private.experience_badge_state(v_uid);
    END IF;
    IF v_req.day_window_start > now() - interval '24 hours' AND v_req.day_submissions >= 5 THEN
      RAISE EXCEPTION 'rate_limited' USING errcode = 'P0001',
        DETAIL = 'Не больше пяти заявок в сутки.';
    END IF;
  END IF;

  INSERT INTO public.experience_badge_requests AS r
    (user_id, about, whatsapp, status, submitted_at, revision, day_window_start, day_submissions)
  VALUES (v_uid, v_about, v_wa, 'pending', now(), 1, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET about = EXCLUDED.about, whatsapp = EXCLUDED.whatsapp,
        status = 'pending', rejection_reason = NULL,
        reviewed_at = NULL, reviewed_by = NULL, submitted_at = now(),
        revision = r.revision + 1,
        day_window_start = CASE WHEN r.day_window_start > now() - interval '24 hours'
                                THEN r.day_window_start ELSE now() END,
        day_submissions = CASE WHEN r.day_window_start > now() - interval '24 hours'
                               THEN r.day_submissions + 1 ELSE 1 END;

  RETURN xtrud_private.experience_badge_state(v_uid);
END;
$function$;

CREATE FUNCTION public.my_experience_badge_request()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;
  RETURN coalesce(
    xtrud_private.experience_badge_state(auth.uid()),
    jsonb_build_object('status', 'none', 'about', NULL, 'whatsapp', NULL, 'reason', NULL,
                       'submitted_at', NULL, 'granted_at', NULL));
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_experience_badge_request(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_experience_badge_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_experience_badge_request(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_experience_badge_request() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Админка: только админ.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action = ANY (ARRAY[
    'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order',
    'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve',
    'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone',
    'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update',
    'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show',
    'category_hide', 'set_find_tiles', 'broadcast_push', 'category_open_responses',
    'set_require_login', 'instagram_approve', 'instagram_reject', 'experience_badge_grant',
    'experience_badge_revoke', 'set_composer_start', 'set_composer_form',
    'order_set_category', 'category_create', 'order_shadow_hide', 'order_shadow_unhide',
    'category_update', 'category_merge', 'section_rename', 'catalog_reorder',
    'staff_role_set', 'order_test_mark',
    'company_approve', 'company_reject', 'company_revoke',
    'experience_badge_reject'
  ]::text[]));

-- «На проверке» — только без значка: выданный вручную значок закрывает
-- заявку в списке (одобрить её можно — это ничего не меняет).
CREATE FUNCTION public.admin_list_experience_badge_requests(
  p_status text DEFAULT 'pending', p_limit integer DEFAULT 50)
 RETURNS TABLE(user_id uuid, user_label text, about text, whatsapp text, status text,
               reason text, submitted_at timestamptz, reviewed_at timestamptz,
               granted_at timestamptz, revision integer, categories text[],
               is_verified boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  RETURN QUERY
  SELECT r.user_id,
         (SELECT nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
            FROM public.users u WHERE u.id = r.user_id),
         r.about, r.whatsapp, r.status, r.rejection_reason,
         r.submitted_at, r.reviewed_at, m.experience_badge_at, r.revision,
         coalesce((SELECT array_agg(l2.name_ru ORDER BY l2.name_ru)
                     FROM public.master_categories mc
                     JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
                    WHERE mc.master_id = r.user_id), ARRAY[]::text[]),
         coalesce(m.verification_level >= 2, false)
    FROM public.experience_badge_requests r
    LEFT JOIN public.master_profiles m ON m.user_id = r.user_id
   WHERE (p_status IS NULL OR r.status = p_status)
     AND NOT (r.status = 'pending' AND m.experience_badge_at IS NOT NULL)
   ORDER BY (r.status = 'pending') DESC, r.submitted_at
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$function$;

-- Одобрение ставит значок (как admin_set_experience_badge), отказ — с
-- причиной. p_revision обязателен; своё — нельзя. Блокировки: сначала
-- master_profiles, потом заявка (как в подаче).
CREATE FUNCTION public.admin_review_experience_badge_request(
  p_user_id uuid, p_approve boolean, p_reason text DEFAULT NULL, p_revision integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req    public.experience_badge_requests%ROWTYPE;
  v_badge  timestamptz;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now    timestamptz := now();
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_user_id IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'self_review_forbidden' USING errcode = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'bad_approve' USING errcode = '22023';
  END IF;
  IF p_revision IS NULL THEN
    RAISE EXCEPTION 'revision_required' USING errcode = '22023';
  END IF;
  IF NOT p_approve AND (v_reason IS NULL OR char_length(v_reason) < 3) THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  SELECT m.experience_badge_at INTO v_badge
    FROM public.master_profiles m WHERE m.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_open' USING errcode = 'P0002';
  END IF;
  SELECT * INTO v_req FROM public.experience_badge_requests r
   WHERE r.user_id = p_user_id AND r.status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_open' USING errcode = 'P0002';
  END IF;
  IF p_revision IS DISTINCT FROM v_req.revision THEN
    RAISE EXCEPTION 'request_changed' USING errcode = 'P0001';
  END IF;

  UPDATE public.experience_badge_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         rejection_reason = CASE WHEN p_approve THEN NULL ELSE left(v_reason, 300) END,
         reviewed_at = v_now, reviewed_by = auth.uid()
   WHERE user_id = p_user_id;

  IF p_approve AND v_badge IS NULL THEN
    UPDATE public.master_profiles
       SET experience_badge_at = v_now, updated_at = v_now
     WHERE user_id = p_user_id;
  END IF;

  PERFORM public.admin_log_action(
    CASE WHEN p_approve THEN 'experience_badge_grant' ELSE 'experience_badge_reject' END,
    'user', p_user_id, coalesce(v_reason, 'Заявка на значок проверена'), NULL,
    jsonb_build_object('source', 'request', 'revision', v_req.revision));

  IF p_approve AND v_badge IS NULL THEN
    PERFORM public.notify_user(p_user_id, 'Значок «Большой опыт»',
      'Мы отметили ваш опыт — значок виден клиентам в вашем профиле.',
      jsonb_build_object('type', 'experience_badge'));
  ELSIF NOT p_approve THEN
    PERFORM public.notify_user(p_user_id, 'Значок «Большой опыт» пока не выдан',
      'Причина: ' || left(v_reason, 200),
      jsonb_build_object('type', 'system', 'kind', 'experience_badge_review'));
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    'granted_at', CASE WHEN p_approve THEN coalesce(v_badge, v_now) END);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_experience_badge_requests(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_experience_badge_request(uuid, boolean, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_experience_badge_requests(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_experience_badge_request(uuid, boolean, text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Push админам о новой заявке на значок. Срабатывает на новую редакцию
--    в статусе pending (вставка или revision выросла). В тексте — без
--    названия и имени: push виден на заблокированном экране. Ошибка push
--    заявку не роняет.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.notify_admins_badge_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid;
  v_body  text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.revision IS NOT DISTINCT FROM OLD.revision
     AND OLD.status = 'pending' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.user_id AND u.is_demo) THEN
    RETURN NULL;
  END IF;
  v_body := CASE TG_TABLE_NAME
    WHEN 'company_verifications' THEN 'Компания просит подтверждение — раздел «Компании» в админке.'
    ELSE 'Специалист просит значок «Большой опыт» — раздел «Большой опыт» в админке.'
  END;
  FOR v_admin IN
    SELECT u.id FROM public.users u
     WHERE u.is_admin AND NOT u.is_demo AND u.status = 'active'
       AND u.id <> NEW.user_id
  LOOP
    -- Одному админу — не чаще раза в 10 минут: очередь видна в админке,
    -- волна заявок не превращается в волну push (ревью 0246 М3).
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id = v_admin AND n.data->>'kind' = 'badge_request'
         AND n.created_at > now() - interval '10 minutes');
    BEGIN
      PERFORM public.notify_user(v_admin, 'Заявка на значок', v_body,
        jsonb_build_object('type', 'system', 'kind', 'badge_request'));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'badge_request push %: %', NEW.user_id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'badge_request notify %: %', NEW.user_id, SQLERRM;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.notify_admins_badge_request()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER company_verifications_notify_admins
  AFTER INSERT OR UPDATE OF status, revision ON public.company_verifications
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.notify_admins_badge_request();
CREATE TRIGGER experience_badge_requests_notify_admins
  AFTER INSERT OR UPDATE OF status, revision ON public.experience_badge_requests
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.notify_admins_badge_request();

-- ---------------------------------------------------------------------------
-- 6. Удаление аккаунта: + заявка и значок «Большой опыт». Живое тело,
--    две точечные вставки; каждая замена должна найти ровно одно место.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_src text;
  v_new text;
  a1 constant text := E'         company_verified_at = NULL,\n';
  a2 constant text := E'  DELETE FROM public.company_verifications WHERE user_id = v_user_id;\n';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure;
  IF (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1
     OR (length(v_src) - length(replace(v_src, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION '0246_delete_my_account_anchor';
  END IF;
  v_new := replace(v_src, a1, a1 || E'         experience_badge_at = NULL,\n');
  v_new := replace(v_new, a2, a2 ||
    E'  -- Заявка на значок «Большой опыт» (0246): текст об опыте, WhatsApp.\n' ||
    E'  DELETE FROM public.experience_badge_requests WHERE user_id = v_user_id;\n');
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS jsonb LANGUAGE plpgsql '
    'SECURITY DEFINER SET search_path TO ''public'', ''pg_temp'' AS %L', v_new);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Самопроверка.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.submit_experience_badge_request(text,text)',
    'public.my_experience_badge_request()',
    'public.admin_list_experience_badge_requests(text,integer)',
    'public.admin_review_experience_badge_request(uuid,boolean,text,integer)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('public', f, 'EXECUTE') THEN
      RAISE EXCEPTION '0246_grants_too_wide: %', f;
    END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION '0246_lost_needed_access: %', f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'xtrud_private.experience_badge_state(uuid)',
    'xtrud_private.notify_admins_badge_request()'] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '0246_private_exposed: %', f;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.experience_badge_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.experience_badge_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.experience_badge_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.experience_badge_requests', 'UPDATE') THEN
    RAISE EXCEPTION '0246_table_exposed';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
       NOT LIKE '%DELETE FROM public.experience_badge_requests WHERE user_id = v_user_id;%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
       NOT LIKE '%experience_badge_at = NULL,%'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
        IS DISTINCT FROM 'f8c0264deb29e46f8e723cca56959b83'
     OR (SELECT proconfig FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
        IS DISTINCT FROM '{"search_path=public, pg_temp"}'::text[]
     OR NOT has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE')
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
     OR has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE') THEN
    RAISE EXCEPTION '0246_delete_my_account_check';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
