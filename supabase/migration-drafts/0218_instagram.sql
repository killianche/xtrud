-- 0218: Instagram специалиста — в профиле после проверки админом (№207).
--
-- Владелец, 2026-10-04: «дадим специалистам добавлять свой инстаграм —
-- отображается в профиле после проверки админа; если меняется — повторная
-- проверка».
--
-- Как устроено:
--   - заявка — xtrud_private.instagram_requests (одна на человека); ролям
--     API она недоступна;
--   - специалист пишет только через submit_instagram(handle): имя
--     нормализуется (@имя, ссылка instagram.com/имя → имя) и проверяется;
--     новое имя → заявка «на проверке», а в профиле Instagram скрывается до
--     решения (повторная проверка); то же имя, что уже одобрено, — без
--     изменений; пусто — убрать;
--   - в профиле — master_profiles.instagram, только одобренное. Колонку
--     пишут лишь функции владельца базы: прав UPDATE на неё у ролей API нет;
--   - админка: admin_list_instagram_requests / admin_review_instagram,
--     счётчик в admin_attention, уведомление специалисту о решении, журнал.
--
-- Применять от postgres после 0217. Откат: 0218_instagram_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0218_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'master_profiles'
                AND column_name = 'instagram') THEN
    RAISE EXCEPTION '0218_already_applied';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conname = 'admin_actions_action_check' AND conrelid = 'public.admin_actions'::regclass)
     IS DISTINCT FROM '7b49c82a98aac85fc6426a172c212bf5' THEN
    RAISE EXCEPTION '0218_action_check_not_from_0217';
  END IF;
  IF to_regprocedure('public.admin_attention()') IS NULL THEN
    RAISE EXCEPTION '0218_needs_0215';
  END IF;
END;
$$;

-- 1. Одобренное имя — в профиле. Пишут только функции ниже.
ALTER TABLE public.master_profiles ADD COLUMN instagram text
  CHECK (instagram IS NULL OR instagram ~ '^[A-Za-z0-9._]{1,30}$');
COMMENT ON COLUMN public.master_profiles.instagram IS
  'Instagram, одобренный админом (0218). Пишут только submit_instagram / admin_review_instagram.';
GRANT SELECT (instagram) ON public.master_profiles TO anon;

-- 2. Заявки.
CREATE TABLE xtrud_private.instagram_requests (
  user_id      uuid        PRIMARY KEY REFERENCES public.master_profiles (user_id) ON DELETE CASCADE,
  handle       text        NOT NULL CHECK (handle ~ '^[A-Za-z0-9._]{1,30}$'),
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason       text        CHECK (reason IS NULL OR length(reason) <= 300),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid        REFERENCES auth.users (id) ON DELETE SET NULL
);
CREATE INDEX instagram_requests_status ON xtrud_private.instagram_requests (status, submitted_at);
REVOKE ALL ON xtrud_private.instagram_requests FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE xtrud_private.instagram_requests ENABLE ROW LEVEL SECURITY;

-- 3. Нормализация: «@name», «instagram.com/name/», «https://www.instagram.com/name?igsh=…» → name.
CREATE FUNCTION xtrud_private.normalize_instagram(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT nullif(
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(btrim(coalesce(p_raw, '')), '^(https?://)?(www\.)?(instagram\.com|instagr\.am)/', '', 'i'),
          '[/?#].*$', ''),
        '^@', '')),
    '');
$function$;
REVOKE ALL ON FUNCTION xtrud_private.normalize_instagram(text) FROM PUBLIC, anon, authenticated, service_role;

-- 4. Специалист: отправить, изменить, убрать.
CREATE FUNCTION public.submit_instagram(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_handle text := xtrud_private.normalize_instagram(p_handle);
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.status = 'active') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  SELECT m.instagram INTO v_current FROM public.master_profiles m WHERE m.user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;

  -- Пусто — убрать из профиля и заявку.
  IF v_handle IS NULL THEN
    UPDATE public.master_profiles SET instagram = NULL WHERE user_id = v_uid;
    DELETE FROM xtrud_private.instagram_requests WHERE user_id = v_uid;
    RETURN jsonb_build_object('status', 'none', 'handle', NULL);
  END IF;
  IF v_handle !~ '^[A-Za-z0-9._]{1,30}$' THEN
    RAISE EXCEPTION 'bad_instagram' USING errcode = '22023';
  END IF;

  -- То же, что уже одобрено, — ничего не меняется.
  IF v_current = v_handle THEN
    RETURN jsonb_build_object('status', 'approved', 'handle', v_handle);
  END IF;

  -- Новое имя: в профиле скрыть до проверки, заявка — заново.
  UPDATE public.master_profiles SET instagram = NULL WHERE user_id = v_uid;
  INSERT INTO xtrud_private.instagram_requests (user_id, handle, status, submitted_at)
  VALUES (v_uid, v_handle, 'pending', now())
  ON CONFLICT (user_id) DO UPDATE
    SET handle = EXCLUDED.handle, status = 'pending', reason = NULL,
        submitted_at = now(), reviewed_at = NULL, reviewed_by = NULL;
  RETURN jsonb_build_object('status', 'pending', 'handle', v_handle);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_instagram(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_instagram(text) TO authenticated;

CREATE FUNCTION public.my_instagram()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT jsonb_build_object('status', r.status, 'handle', r.handle, 'reason', r.reason)
       FROM xtrud_private.instagram_requests r WHERE r.user_id = auth.uid()),
    (SELECT jsonb_build_object('status', 'approved', 'handle', m.instagram, 'reason', NULL)
       FROM public.master_profiles m WHERE m.user_id = auth.uid() AND m.instagram IS NOT NULL),
    jsonb_build_object('status', 'none', 'handle', NULL, 'reason', NULL));
$function$;
REVOKE ALL ON FUNCTION public.my_instagram() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_instagram() TO authenticated;

-- 5. Админка.
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show', 'category_hide',
  'set_find_tiles', 'broadcast_push',
  'category_open_responses', 'set_require_login',
  'instagram_approve', 'instagram_reject'
]::text[]));

CREATE FUNCTION public.admin_list_instagram_requests(p_status text DEFAULT 'pending', p_limit integer DEFAULT 50)
 RETURNS TABLE(user_id uuid, user_label text, handle text, status text, reason text,
               submitted_at timestamptz, reviewed_at timestamptz)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT r.user_id,
         (SELECT nullif(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
            FROM public.users u WHERE u.id = r.user_id),
         r.handle, r.status, r.reason, r.submitted_at, r.reviewed_at
    FROM xtrud_private.instagram_requests r
   WHERE p_status IS NULL OR r.status = p_status
   ORDER BY (r.status = 'pending') DESC, r.submitted_at
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$function$;

-- Одобряется ровно то имя, что видел админ: если специалист успел сменить
-- его, решение не применится (ревью xtrud-security 2026-10-04, M1).
CREATE FUNCTION public.admin_review_instagram(p_user_id uuid, p_handle text, p_approve boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req xtrud_private.instagram_requests%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'bad_visible' USING errcode = '22023';
  END IF;
  IF NOT p_approve AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  SELECT * INTO v_req FROM xtrud_private.instagram_requests r
   WHERE r.user_id = p_user_id AND r.status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_open' USING errcode = 'P0002';
  END IF;
  IF v_req.handle IS DISTINCT FROM p_handle THEN
    RAISE EXCEPTION 'request_changed' USING errcode = 'P0001';
  END IF;

  UPDATE xtrud_private.instagram_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reason = CASE WHEN p_approve THEN NULL ELSE left(v_reason, 300) END,
         reviewed_at = now(), reviewed_by = auth.uid()
   WHERE user_id = p_user_id;
  UPDATE public.master_profiles
     SET instagram = CASE WHEN p_approve THEN v_req.handle ELSE NULL END
   WHERE user_id = p_user_id;

  PERFORM public.admin_log_action(
    CASE WHEN p_approve THEN 'instagram_approve' ELSE 'instagram_reject' END,
    'user', p_user_id, coalesce(v_reason, 'Instagram проверен'), NULL,
    jsonb_build_object('handle', v_req.handle));

  PERFORM public.notify_user(
    p_user_id,
    CASE WHEN p_approve THEN 'Instagram в профиле' ELSE 'Instagram не прошёл проверку' END,
    CASE WHEN p_approve THEN '@' || v_req.handle || ' теперь виден в вашем профиле.'
         ELSE 'Причина: ' || left(v_reason, 200) END,
    jsonb_build_object('type', 'system', 'kind', 'instagram_review'));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_instagram_requests(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_instagram(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_instagram_requests(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_instagram(uuid, text, boolean, text) TO authenticated, service_role;

-- Счётчик очереди в «Требует внимания».
CREATE OR REPLACE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN jsonb_build_object(
    'reports_open',          (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'verifications_pending', (SELECT count(*) FROM public.master_verifications WHERE status = 'pending'),
    'recovery_new',          (SELECT count(*) FROM xtrud_private.recovery_requests WHERE status = 'new'),
    'masters_pending',       (SELECT count(*) FROM public.master_profiles WHERE status = 'pending'),
    'instagram_pending',     (SELECT count(*) FROM xtrud_private.instagram_requests WHERE status = 'pending')
  );
END;
$function$;

-- Проверки после изменений.
DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.master_profiles', 'instagram', 'UPDATE')
     OR has_column_privilege('anon', 'public.master_profiles', 'instagram', 'UPDATE')
     OR has_table_privilege('authenticated', 'xtrud_private.instagram_requests', 'SELECT')
     OR has_function_privilege('anon', 'public.submit_instagram(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_review_instagram(uuid,text,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0218_grants_too_wide';
  END IF;
  IF NOT has_column_privilege('anon', 'public.master_profiles', 'instagram', 'SELECT') THEN
    RAISE EXCEPTION '0218_public_cannot_read';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
