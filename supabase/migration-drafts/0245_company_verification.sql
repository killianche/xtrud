-- 0245: подтверждение компании (№308, 2026-10-08).
--
-- Решение владельца — docs/COMPANY_VERIFICATION_2026-10.md (§3): специалист
-- показывается как «Частный мастер» или «Компания» с названием; заявка
-- «Подтвердить компанию» (название, Instagram, WhatsApp, ИНН по желанию);
-- админ подтверждает — у компании значок, Instagram из заявки виден в
-- профиле как проверенный; смена названия снимает значок.
--
-- Ревью xtrud-security 2026-10-08 (учтено в этой редакции):
--   §1 подтверждение компаний — ТОЛЬКО админ (is_admin_session): WhatsApp и
--      ИНН — персональные данные, по docs/STAFF_ROLES_2026-10.md §2 ПДн и
--      Instagram — только админ. Управляющему все три admin_* — forbidden;
--   §2 p_revision обязателен ('revision_required');
--   §3 самоодобрение и самоотзыв запрещены ('self_review_forbidden');
--   §4 название: белый список символов (буквы любого алфавита, цифры,
--      пробел и . , - & " ' « » ( ) № +), без невидимых символов, эмодзи и
--      галочек; стоп-слова (xtrud, икстру, поддержк, администрац, модерат,
--      подтвержд, проверен, официальн, verified, official) — 'bad_legal_name';
--   блокировки: сначала master_profiles, потом заявка — везде;
--   страж: у подтверждённой компании legal_name и account_type меняет только
--      владелец базы; переименование через set_account_type, которое снова
--      ставит заявку в очередь, считается в лимит 5 подач в сутки;
--      withdrawn обнуляет ИНН.
--
-- Было (FACT, живой снимок 2026-10-08):
--   * master_profiles.account_type master_account_type (solo|brigade|company),
--     legal_name text (<= 200) — у всех 12 профилей solo и legal_name NULL;
--     UPDATE-гранта на эти столбцы у authenticated нет; anon legal_name не
--     читает (только authenticated);
--   * search_masters не отдаёт ни account_type, ни legal_name.
--
-- Стало:
--   * master_profiles.company_verified_at timestamptz — значок «Компания
--     подтверждена». CHECK: только у account_type = 'company'. Гранта UPDATE
--     у ролей API нет; второй рубеж — страж master_profiles_moderation_guard
--     (меняет только postgres, т.е. SECURITY DEFINER-функции ниже).
--   * CHECK master_profiles_legal_name_not_solo: у «Частного мастера»
--     legal_name пуст. Поэтому название безопасно открыть гостю:
--     GRANT SELECT (legal_name, company_verified_at) TO anon — иначе REST-запрос
--     гостя с этими столбцами падал бы целиком (колоночные гранты).
--     authenticated читает новый столбец через табличный SELECT (как
--     verification_level).
--   * public.company_verifications — одна заявка на человека. Владелец читает
--     свою строку (RLS + колоночный SELECT), писать напрямую нельзя никому из
--     ролей API.
--   * submit_company_verification, set_account_type, my_company_verification —
--     для специалиста; admin_list_company_verifications,
--     admin_review_company_verification, admin_revoke_company — только админ
--     (is_admin_session), журнал admin_actions, уведомление.
--   * xtrud_private.company_name_valid(text) — проверка названия (§4).
--   * search_masters: + account_type, legal_name (только у компании),
--     company_verified в конце выдачи; поиск по тексту ищет и по названию.
--     Тип результата меняется — DROP + CREATE, права прежние
--     (anon, authenticated, service_role).
--   * delete_my_account: стирает заявку компании и значок (account_type → solo).
--     Остальное тело — живое тело после 0244 (md5 prosrc сверяется).
--
-- Откат: 0245_company_verification_rollback.sql.
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Предусловия: живые редакции 2026-10-08 (после 0244).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0245_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'master_profiles'
                AND column_name = 'company_verified_at')
     OR to_regclass('public.company_verifications') IS NOT NULL
     OR to_regprocedure('public.submit_company_verification(text,text,text,text)') IS NOT NULL
     OR to_regprocedure('public.set_account_type(text,text)') IS NOT NULL
     OR to_regprocedure('public.my_company_verification()') IS NOT NULL
     OR to_regprocedure('public.admin_list_company_verifications(text,integer)') IS NOT NULL
     OR to_regprocedure('public.admin_review_company_verification(uuid,boolean,text,integer)') IS NOT NULL
     OR to_regprocedure('public.admin_revoke_company(uuid,text)') IS NOT NULL
     OR to_regprocedure('xtrud_private.company_verification_state(uuid)') IS NOT NULL
     OR to_regprocedure('xtrud_private.company_name_valid(text)') IS NOT NULL THEN
    RAISE EXCEPTION '0245_already_applied';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM 'c82599cfcb8dd33ebe110b9016305873' THEN
    RAISE EXCEPTION '0245_admin_actions_action_check_changed';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
       IS DISTINCT FROM '51d41114194685f29243be370da994e0' THEN
    RAISE EXCEPTION '0245_delete_my_account_drifted';
  END IF;
  IF md5(pg_get_functiondef('public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)'::regprocedure))
       IS DISTINCT FROM 'c44729c5a91dff16cd0fa56c99b54ba8' THEN
    RAISE EXCEPTION '0245_search_masters_drifted';
  END IF;
  IF md5(pg_get_functiondef('xtrud_private.guard_master_profile_moderation()'::regprocedure))
       IS DISTINCT FROM '70c88c1fccc8024c91271f2d71853e8c' THEN
    RAISE EXCEPTION '0245_moderation_guard_drifted';
  END IF;
  IF md5(pg_get_functiondef('xtrud_private.normalize_instagram(text)'::regprocedure))
       IS DISTINCT FROM '3a4f06e0c9fd292e4b6030937b25d768'
     OR to_regclass('xtrud_private.instagram_requests') IS NULL
     OR to_regprocedure('public.is_admin_session()') IS NULL
     OR to_regprocedure('public.notify_user(uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION '0245_needs_0218_0239';
  END IF;
  IF EXISTS (SELECT 1 FROM public.master_profiles
              WHERE account_type = 'solo' AND legal_name IS NOT NULL) THEN
    RAISE EXCEPTION '0245_solo_with_legal_name';
  END IF;
  IF has_column_privilege('authenticated', 'public.master_profiles', 'legal_name', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_profiles', 'account_type', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_profiles', 'instagram', 'UPDATE') THEN
    RAISE EXCEPTION '0245_master_profiles_grants_changed';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Значок в профиле.
-- ---------------------------------------------------------------------------
ALTER TABLE public.master_profiles ADD COLUMN company_verified_at timestamptz;
ALTER TABLE public.master_profiles
  ADD CONSTRAINT master_profiles_company_verified_only_company
  CHECK (company_verified_at IS NULL OR account_type = 'company');
ALTER TABLE public.master_profiles
  ADD CONSTRAINT master_profiles_legal_name_not_solo
  CHECK (account_type <> 'solo' OR legal_name IS NULL);
COMMENT ON COLUMN public.master_profiles.company_verified_at IS
  'Компания подтверждена админом (0245). Пишут только функции владельца базы.';
GRANT SELECT (legal_name, company_verified_at) ON public.master_profiles TO anon;

-- ---------------------------------------------------------------------------
-- 2. Заявки.
-- ---------------------------------------------------------------------------
-- revision растёт при каждой подаче и смене названия: админ подтверждает
-- ровно ту редакцию, которую видел (как p_handle у Instagram, ревью M1 0218).
-- day_window_start / day_submissions — лимит 5 подач за 24 часа; при выборе
-- «Частный мастер» строка не удаляется (status = 'withdrawn'), чтобы лимит
-- нельзя было сбросить.
CREATE TABLE public.company_verifications (
  user_id          uuid        PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  legal_name       text        NOT NULL CHECK (char_length(legal_name) BETWEEN 2 AND 80),
  instagram        text        NOT NULL CHECK (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  whatsapp         text        NOT NULL CHECK (whatsapp ~ '^[0-9]{10,15}$'),
  inn              text        CHECK (inn IS NULL OR inn ~ '^([0-9]{10}|[0-9]{12})$'),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid        REFERENCES public.users (id) ON DELETE SET NULL,
  rejection_reason text        CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 300),
  revision         integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  day_window_start timestamptz NOT NULL DEFAULT now(),
  day_submissions  smallint    NOT NULL DEFAULT 1 CHECK (day_submissions >= 0)
);
CREATE INDEX company_verifications_status_idx
  ON public.company_verifications (status, submitted_at);
COMMENT ON TABLE public.company_verifications IS
  'Заявки «Подтвердить компанию» (0245). Пишут только submit_company_verification, set_account_type, admin_* и delete_my_account.';

ALTER TABLE public.company_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_verifications FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (user_id, legal_name, instagram, whatsapp, inn, status, submitted_at,
              reviewed_at, rejection_reason)
  ON public.company_verifications TO authenticated;
CREATE POLICY company_verifications_select_own ON public.company_verifications
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Название компании (ревью §4). Классы [[:alpha:]]/[[:digit:]] зависят от
--    локали базы (en_US.UTF-8, FACT 2026-10-08): кириллица и латиница —
--    буквы; U+200B, эмодзи и ✓/✅ — нет. Самопроверка ниже остановит
--    миграцию, если локаль классифицирует иначе.
-- ---------------------------------------------------------------------------
CREATE FUNCTION xtrud_private.company_name_valid(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT coalesce(
    char_length(p_name) BETWEEN 2 AND 80
    AND p_name ~ '^[[:alpha:][:digit:] .,&"''«»()№+-]+$'
    AND p_name ~ '[[:alpha:][:digit:]]'
    AND p_name !~* '(xtrud|икстру|поддержк|администрац|модерат|подтвержд|проверен|официальн|verified|official)',
    false);
$function$;
REVOKE ALL ON FUNCTION xtrud_private.company_name_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['Крутые семечки', 'ИП Оздоев', 'Ремонт-Сервис 24',
                           'Ёлка «Ромашка» № 1 (ООО) & Co.', 'O''Brien'] LOOP
    IF NOT xtrud_private.company_name_valid(v) THEN
      RAISE EXCEPTION '0245_company_name_rejects_valid: %', v;
    END IF;
  END LOOP;
  FOREACH v IN ARRAY ARRAY['Семечки ✅', 'Семечки ✓', 'Поддержка xtrud', 'Подтверждённая компания',
                           'Семе' || chr(8203) || 'чки', 'VERIFIED shop', 'ОФИЦИАЛЬНЫЙ',
                           'Модератор', 'Администрация', 'Проверенный мастер', '...', 'А'] LOOP
    IF xtrud_private.company_name_valid(v) THEN
      RAISE EXCEPTION '0245_company_name_accepts_invalid: %', v;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3a. Ответ «моя компания» — одна форма для всех функций специалиста.
-- ---------------------------------------------------------------------------
-- withdrawn и отсутствие заявки — 'none'.
CREATE FUNCTION xtrud_private.company_verification_state(p_uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'account_type', m.account_type::text,
    'status',       CASE WHEN r.status IS NULL OR r.status = 'withdrawn' THEN 'none' ELSE r.status END,
    'legal_name',   CASE WHEN m.account_type = 'company' THEN m.legal_name END,
    'instagram',    CASE WHEN r.status IN ('pending', 'approved', 'rejected') THEN r.instagram END,
    'whatsapp',     CASE WHEN r.status IN ('pending', 'approved', 'rejected') THEN r.whatsapp END,
    'inn',          CASE WHEN r.status IN ('pending', 'approved', 'rejected') THEN r.inn END,
    'reason',       CASE WHEN r.status = 'rejected' THEN r.rejection_reason END,
    'submitted_at', CASE WHEN r.status IN ('pending', 'approved', 'rejected') THEN r.submitted_at END,
    'verified_at',  m.company_verified_at)
    FROM public.master_profiles m
    LEFT JOIN public.company_verifications r ON r.user_id = m.user_id
   WHERE m.user_id = p_uid;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.company_verification_state(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Специалист.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.submit_company_verification(
  p_legal_name text, p_instagram text, p_whatsapp text, p_inn text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_legal_name, ''), '\s+', ' ', 'g'));
  v_ig   text := xtrud_private.normalize_instagram(p_instagram);
  v_wa   text := regexp_replace(coalesce(p_whatsapp, ''), '[\s()+-]', '', 'g');
  v_inn  text := nullif(regexp_replace(coalesce(p_inn, ''), '[\s-]', '', 'g'), '');
  v_req  public.company_verifications%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.status = 'active') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  PERFORM 1 FROM public.master_profiles m WHERE m.user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;

  IF NOT xtrud_private.company_name_valid(v_name) THEN
    RAISE EXCEPTION 'bad_legal_name' USING errcode = '22023';
  END IF;
  IF v_ig IS NULL OR v_ig !~ '^[A-Za-z0-9._]{1,30}$' THEN
    RAISE EXCEPTION 'bad_instagram' USING errcode = '22023';
  END IF;
  IF v_wa !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'bad_whatsapp' USING errcode = '22023';
  END IF;
  IF v_inn IS NOT NULL AND v_inn !~ '^([0-9]{10}|[0-9]{12})$' THEN
    RAISE EXCEPTION 'bad_inn' USING errcode = '22023';
  END IF;

  SELECT * INTO v_req FROM public.company_verifications r WHERE r.user_id = v_uid FOR UPDATE;

  IF FOUND THEN
    -- Подтверждённая компания с тем же названием и Instagram: обновить
    -- только контакты для админа, значок остаётся.
    IF v_req.status = 'approved' AND v_req.legal_name = v_name AND v_req.instagram = v_ig
       AND EXISTS (SELECT 1 FROM public.master_profiles m
                    WHERE m.user_id = v_uid AND m.account_type = 'company'
                      AND m.legal_name = v_name AND m.company_verified_at IS NOT NULL) THEN
      UPDATE public.company_verifications SET whatsapp = v_wa, inn = v_inn WHERE user_id = v_uid;
      RETURN xtrud_private.company_verification_state(v_uid);
    END IF;
    -- Та же заявка уже на проверке (повторное нажатие) — без изменений.
    IF v_req.status = 'pending' AND v_req.legal_name = v_name AND v_req.instagram = v_ig
       AND v_req.whatsapp = v_wa AND v_req.inn IS NOT DISTINCT FROM v_inn THEN
      RETURN xtrud_private.company_verification_state(v_uid);
    END IF;
    -- Не чаще 5 подач за 24 часа.
    IF v_req.day_window_start > now() - interval '24 hours' AND v_req.day_submissions >= 5 THEN
      RAISE EXCEPTION 'rate_limited' USING errcode = 'P0001',
        DETAIL = 'Не больше пяти заявок в сутки.';
    END IF;
  END IF;

  INSERT INTO public.company_verifications AS r
    (user_id, legal_name, instagram, whatsapp, inn, status, submitted_at,
     revision, day_window_start, day_submissions)
  VALUES (v_uid, v_name, v_ig, v_wa, v_inn, 'pending', now(), 1, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name, instagram = EXCLUDED.instagram,
        whatsapp = EXCLUDED.whatsapp, inn = EXCLUDED.inn,
        status = 'pending', rejection_reason = NULL,
        reviewed_at = NULL, reviewed_by = NULL, submitted_at = now(),
        revision = r.revision + 1,
        day_window_start = CASE WHEN r.day_window_start > now() - interval '24 hours'
                                THEN r.day_window_start ELSE now() END,
        day_submissions = CASE WHEN r.day_window_start > now() - interval '24 hours'
                               THEN r.day_submissions + 1 ELSE 1 END;

  -- Новая или изменённая заявка: значок снимается до решения.
  UPDATE public.master_profiles
     SET account_type = 'company', legal_name = v_name, company_verified_at = NULL
   WHERE user_id = v_uid;

  RETURN xtrud_private.company_verification_state(v_uid);
END;
$function$;

-- «Частный мастер» / «Компания» без заявки. Смена названия или «solo»
-- снимает значок; заявка на проверке или одобренная получает новое название
-- и снова ждёт проверки (это подача: тот же лимит 5 в сутки); при «solo»
-- заявка — withdrawn, ИНН стирается.
CREATE FUNCTION public.set_account_type(p_type text, p_legal_name text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_legal_name, ''), '\s+', ' ', 'g'));
  v_cur  public.master_profiles%ROWTYPE;
  v_req  public.company_verifications%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.status = 'active') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('solo', 'company') THEN
    RAISE EXCEPTION 'bad_account_type' USING errcode = '22023';
  END IF;
  SELECT * INTO v_cur FROM public.master_profiles m WHERE m.user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;

  IF p_type = 'solo' THEN
    UPDATE public.master_profiles
       SET account_type = 'solo', legal_name = NULL, company_verified_at = NULL
     WHERE user_id = v_uid;
    UPDATE public.company_verifications
       SET status = 'withdrawn', inn = NULL, reviewed_at = NULL, reviewed_by = NULL
     WHERE user_id = v_uid AND (status <> 'withdrawn' OR inn IS NOT NULL);
    RETURN xtrud_private.company_verification_state(v_uid);
  END IF;

  IF NOT xtrud_private.company_name_valid(v_name) THEN
    RAISE EXCEPTION 'bad_legal_name' USING errcode = '22023';
  END IF;

  IF v_cur.account_type = 'company' AND v_cur.legal_name = v_name THEN
    RETURN xtrud_private.company_verification_state(v_uid);
  END IF;

  -- Заявка снова встанет в очередь — это подача, лимит общий с submit.
  SELECT * INTO v_req FROM public.company_verifications r
   WHERE r.user_id = v_uid AND r.status IN ('pending', 'approved') FOR UPDATE;
  IF FOUND AND v_req.day_window_start > now() - interval '24 hours'
     AND v_req.day_submissions >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING errcode = 'P0001',
      DETAIL = 'Не больше пяти заявок в сутки.';
  END IF;

  UPDATE public.master_profiles
     SET account_type = 'company', legal_name = v_name, company_verified_at = NULL
   WHERE user_id = v_uid;
  UPDATE public.company_verifications
     SET legal_name = v_name, status = 'pending', rejection_reason = NULL,
         reviewed_at = NULL, reviewed_by = NULL, submitted_at = now(),
         revision = revision + 1,
         day_window_start = CASE WHEN day_window_start > now() - interval '24 hours'
                                 THEN day_window_start ELSE now() END,
         day_submissions = CASE WHEN day_window_start > now() - interval '24 hours'
                                THEN day_submissions + 1 ELSE 1 END
   WHERE user_id = v_uid AND status IN ('pending', 'approved');

  RETURN xtrud_private.company_verification_state(v_uid);
END;
$function$;

CREATE FUNCTION public.my_company_verification()
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
    xtrud_private.company_verification_state(auth.uid()),
    jsonb_build_object('account_type', NULL, 'status', 'none', 'legal_name', NULL,
                       'instagram', NULL, 'whatsapp', NULL, 'inn', NULL, 'reason', NULL,
                       'submitted_at', NULL, 'verified_at', NULL));
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_company_verification(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_account_type(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_company_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_company_verification(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_account_type(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_company_verification() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Админка: только админ (ревью §1: WhatsApp и ИНН — ПДн).
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
    'company_approve', 'company_reject', 'company_revoke'
  ]::text[]));

CREATE FUNCTION public.admin_list_company_verifications(
  p_status text DEFAULT 'pending', p_limit integer DEFAULT 50)
 RETURNS TABLE(user_id uuid, user_label text, legal_name text, instagram text, whatsapp text,
               inn text, status text, reason text, submitted_at timestamptz,
               reviewed_at timestamptz, verified_at timestamptz, revision integer)
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
         r.legal_name, r.instagram, r.whatsapp, r.inn, r.status, r.rejection_reason,
         r.submitted_at, r.reviewed_at, m.company_verified_at, r.revision
    FROM public.company_verifications r
    LEFT JOIN public.master_profiles m ON m.user_id = r.user_id
   WHERE r.status <> 'withdrawn'
     AND (p_status IS NULL OR r.status = p_status)
   ORDER BY (r.status = 'pending') DESC, r.submitted_at
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$function$;

-- Подтверждение: значок + Instagram из заявки в профиль как проверенный
-- (с записью в instagram_requests, как делает admin_review_instagram).
-- p_revision — редакция, которую видел админ: обязателен ('revision_required'),
-- при расхождении 'request_changed'. Своё — нельзя ('self_review_forbidden').
-- Блокировки: сначала master_profiles, потом заявка (как в submit).
CREATE FUNCTION public.admin_review_company_verification(
  p_user_id uuid, p_approve boolean, p_reason text DEFAULT NULL, p_revision integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req    public.company_verifications%ROWTYPE;
  v_mp     public.master_profiles%ROWTYPE;
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
  SELECT * INTO v_mp FROM public.master_profiles m WHERE m.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_open' USING errcode = 'P0002';
  END IF;
  SELECT * INTO v_req FROM public.company_verifications r
   WHERE r.user_id = p_user_id AND r.status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_open' USING errcode = 'P0002';
  END IF;
  IF p_revision IS DISTINCT FROM v_req.revision
     OR v_mp.account_type IS DISTINCT FROM 'company'::public.master_account_type
     OR v_mp.legal_name IS DISTINCT FROM v_req.legal_name THEN
    RAISE EXCEPTION 'request_changed' USING errcode = 'P0001';
  END IF;

  UPDATE public.company_verifications
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         rejection_reason = CASE WHEN p_approve THEN NULL ELSE left(v_reason, 300) END,
         reviewed_at = v_now, reviewed_by = auth.uid()
   WHERE user_id = p_user_id;

  IF p_approve THEN
    UPDATE public.master_profiles
       SET company_verified_at = v_now, instagram = v_req.instagram
     WHERE user_id = p_user_id;
    INSERT INTO xtrud_private.instagram_requests AS ir
      (user_id, handle, status, reason, submitted_at, reviewed_at, reviewed_by)
    VALUES (p_user_id, v_req.instagram, 'approved', NULL, v_now, v_now, auth.uid())
    ON CONFLICT (user_id) DO UPDATE
      SET handle = EXCLUDED.handle, status = 'approved', reason = NULL,
          reviewed_at = EXCLUDED.reviewed_at, reviewed_by = EXCLUDED.reviewed_by;
  END IF;

  PERFORM public.admin_log_action(
    CASE WHEN p_approve THEN 'company_approve' ELSE 'company_reject' END,
    'user', p_user_id, coalesce(v_reason, 'Компания проверена'), NULL,
    jsonb_build_object('legal_name', v_req.legal_name, 'instagram', v_req.instagram,
                       'revision', v_req.revision));

  PERFORM public.notify_user(
    p_user_id,
    CASE WHEN p_approve THEN 'Компания подтверждена' ELSE 'Компания не подтверждена' END,
    CASE WHEN p_approve
         THEN '«' || v_req.legal_name || '»: значок и Instagram @' || v_req.instagram || ' теперь в вашем профиле.'
         ELSE 'Причина: ' || left(v_reason, 200) END,
    jsonb_build_object('type', 'system', 'kind', 'company_review'));

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    'verified_at', CASE WHEN p_approve THEN v_now END);
END;
$function$;

-- Снять значок в любой момент (причина обязательна). Instagram в профиле
-- остаётся: он проверен отдельно; убрать его — через раздел «Instagram».
CREATE FUNCTION public.admin_revoke_company(p_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name   text;
  v_now    timestamptz := now();
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_user_id IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'self_review_forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  SELECT m.legal_name INTO v_name FROM public.master_profiles m
   WHERE m.user_id = p_user_id AND m.company_verified_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_verified' USING errcode = 'P0002';
  END IF;

  UPDATE public.master_profiles SET company_verified_at = NULL WHERE user_id = p_user_id;
  UPDATE public.company_verifications
     SET status = 'rejected', rejection_reason = left(v_reason, 300),
         reviewed_at = v_now, reviewed_by = auth.uid()
   WHERE user_id = p_user_id;

  PERFORM public.admin_log_action(
    'company_revoke', 'user', p_user_id, v_reason, NULL,
    jsonb_build_object('legal_name', v_name));

  PERFORM public.notify_user(
    p_user_id,
    'Подтверждение компании снято',
    'Причина: ' || left(v_reason, 200),
    jsonb_build_object('type', 'system', 'kind', 'company_review'));

  RETURN jsonb_build_object('user_id', p_user_id, 'status', 'rejected', 'verified_at', NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_company_verifications(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_company_verification(uuid, boolean, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_company(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_company_verifications(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_company_verification(uuid, boolean, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_company(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Страж master_profiles: значок меняет только владелец базы.
--    Тело — живое после 0244 плюс одна проверка перед RETURN NEW.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION xtrud_private.guard_master_profile_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Владелец базы и SECURITY DEFINER-функции от него
  -- (admin_set_master_visibility, try_publish_master, delete_my_account …).
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('suspended', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Профиль скрыт модератором. Напишите в поддержку.'
      USING ERRCODE = '42501', DETAIL = 'master_status_moderated';
  END IF;

  IF NEW.status IN ('suspended', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Этот статус профиля ставит только модератор.'
      USING ERRCODE = '42501', DETAIL = 'master_status_moderator_only';
  END IF;

  IF OLD.status = 'suspended'
     AND OLD.is_hidden_from_search IS DISTINCT FROM NEW.is_hidden_from_search
     AND NEW.is_hidden_from_search IS NOT TRUE THEN
    RAISE EXCEPTION 'Профиль скрыт модератором. Напишите в поддержку.'
      USING ERRCODE = '42501', DETAIL = 'master_hidden_by_moderator';
  END IF;

  -- Значок «Компания подтверждена» (0245) ставят и снимают только функции
  -- владельца базы: admin_review_company_verification, admin_revoke_company,
  -- submit_company_verification, set_account_type, delete_my_account.
  -- Гранта UPDATE на столбец у ролей API нет — это второй рубеж.
  IF NEW.company_verified_at IS DISTINCT FROM OLD.company_verified_at THEN
    RAISE EXCEPTION 'Подтверждение компании ставит только модератор.'
      USING ERRCODE = '42501', DETAIL = 'company_verified_moderator_only';
  END IF;

  -- Подтверждённую компанию переименовывают только эти функции: они же
  -- снимают значок (ревью 0245).
  IF OLD.company_verified_at IS NOT NULL
     AND (NEW.legal_name IS DISTINCT FROM OLD.legal_name
          OR NEW.account_type IS DISTINCT FROM OLD.account_type) THEN
    RAISE EXCEPTION 'Название подтверждённой компании меняется только в приложении.'
      USING ERRCODE = '42501', DETAIL = 'company_verified_name_locked';
  END IF;

  RETURN NEW;
END
$function$;

-- ---------------------------------------------------------------------------
-- 7. Удаление аккаунта: + заявка компании и значок.
--    Тело — живое после 0244 (md5 prosrc 51d41114…), две вставки.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id      uuid := auth.uid();
  v_is_master    boolean;
  v_status       public.user_status;
  v_deleted_at   timestamptz := now();
  v_column       text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null — must be authenticated';
  END IF;

  SELECT u.is_master, u.status
    INTO v_is_master, v_status
    FROM public.users u
   WHERE u.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user record not found';
  END IF;

  IF v_status = 'deleted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_deleted');
  END IF;

  -- Файлы: задания для сервера ставятся до обнуления ссылок.
  INSERT INTO xtrud_private.file_deletion_queue (user_id, bucket, object_path, is_prefix)
  SELECT v_user_id, b.bucket, v_user_id::text || '/', true
    FROM (VALUES ('avatars'), ('portfolio'), ('order-photos'), ('master-verifications')) AS b(bucket)
  ON CONFLICT (bucket, object_path) DO NOTHING;

  -- Отклики: живые — отозвать (как раньше), затем стереть контакты и текст во всех.
  UPDATE public.order_responses
     SET status = 'withdrawn',
         updated_at = v_deleted_at
   WHERE master_id = v_user_id
     AND status IN ('sent', 'viewed');

  UPDATE public.order_responses
     SET contact_phone = NULL,
         whatsapp_phone = NULL,
         message = NULL,
         updated_at = v_deleted_at
   WHERE master_id = v_user_id
     AND (contact_phone IS NOT NULL OR whatsapp_phone IS NOT NULL OR message IS NOT NULL);

  IF v_is_master THEN
    UPDATE public.orders
       SET status = 'cancelled',
           picked_master_id = NULL,
           cancelled_by = v_user_id,
           cancel_reason = 'account_deleted_by_master',
           updated_at = v_deleted_at
     WHERE picked_master_id = v_user_id
       AND status IN ('in_progress', 'awaiting_confirmation');

    DELETE FROM public.master_categories WHERE master_id = v_user_id;
    DELETE FROM public.master_service_areas WHERE master_id = v_user_id;
    DELETE FROM public.master_services WHERE master_id = v_user_id;
  END IF;

  -- Работы и паспорт — у любого аккаунта, а не только у текущего специалиста.
  DELETE FROM public.portfolio_items WHERE master_id = v_user_id;

  IF to_regclass('public.portfolio_cases') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.portfolio_cases WHERE master_id = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.master_verifications') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.master_verifications WHERE user_id = $1' USING v_user_id;
  END IF;

  UPDATE public.master_profiles
     SET bio = NULL,
         status = 'archived',
         is_hidden_from_search = true,
         whatsapp_phone = NULL,
         whatsapp_same_as_phone = false,
         instagram = NULL,
         link_url = NULL,
         inn = NULL,
         ogrn = NULL,
         legal_name = NULL,
         account_type = 'solo',
         company_verified_at = NULL,
         updated_at = v_deleted_at
   WHERE user_id = v_user_id;

  -- Задания: живые — отменить (как раньше), затем стереть контакты, адрес и фото во всех.
  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_by = v_user_id,
         cancel_reason = 'account_deleted_by_client',
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND status = 'open';

  UPDATE public.orders
     SET status = 'cancelled',
         picked_master_id = NULL,
         cancelled_by = v_user_id,
         cancel_reason = 'account_deleted_by_client',
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND status IN ('in_progress', 'awaiting_confirmation');

  -- phone_open без телефона нарушает orders_contact_mode_consistency;
  -- chat_only — честное состояние «связи по телефону нет».
  UPDATE public.orders
     SET contact_mode = CASE WHEN contact_mode = 'phone_open'
                             THEN 'chat_only'::public.order_contact_mode
                             ELSE contact_mode END,
         contact_phone = NULL,
         whatsapp_phone = NULL,
         contact_name = NULL,
         address = NULL,
         photo_urls = '{}'::text[],
         updated_at = v_deleted_at
   WHERE client_id = v_user_id
     AND (contact_phone IS NOT NULL OR whatsapp_phone IS NOT NULL
          OR contact_name IS NOT NULL OR address IS NOT NULL
          OR cardinality(photo_urls) > 0);

  -- Прочие персональные следы.
  DELETE FROM public.notification_tokens WHERE user_id = v_user_id;
  DELETE FROM public.user_contacts WHERE user_id = v_user_id;
  IF to_regclass('xtrud_private.instagram_requests') IS NOT NULL THEN
    EXECUTE 'DELETE FROM xtrud_private.instagram_requests WHERE user_id = $1' USING v_user_id;
  END IF;
  -- Заявка «Подтвердить компанию» (0245): название, Instagram, WhatsApp, ИНН.
  DELETE FROM public.company_verifications WHERE user_id = v_user_id;
  IF to_regclass('xtrud_private.recovery_requests') IS NOT NULL THEN
    -- phone NOT NULL с проверкой длины 10..20: заменяем обезличенной меткой.
    EXECUTE $q$
      UPDATE xtrud_private.recovery_requests
         SET phone = '0000000000', note = NULL
       WHERE user_id = $1
    $q$ USING v_user_id;
  END IF;

  -- Аналитика (0243): только колонки, которые реально есть.
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    FOREACH v_column IN ARRAY ARRAY['actor_id', 'master_id'] LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'analytics_events'
           AND column_name = v_column
      ) THEN
        EXECUTE format('UPDATE public.analytics_events SET %1$I = NULL WHERE %1$I = $1', v_column)
          USING v_user_id;
      END IF;
    END LOOP;
  END IF;

  -- Статус deleted — последним: guard_content_author_active пропускает правки
  -- контента только от активного аккаунта.
  UPDATE public.users
     SET first_name = 'Удалённый пользователь',
         last_name = NULL,
         avatar_url = NULL,
         city_id = NULL,
         district = NULL,
         contact_phone = NULL,
         username = NULL,
         status = 'deleted',
         rating_as_client_avg = NULL,
         rating_as_client_count = 0,
         updated_at = v_deleted_at
   WHERE id = v_user_id;

  UPDATE public.users_private
     SET phone = NULL,
         birth_year = NULL,
         gender = 'unspecified',
         last_active_at = NULL,
         updated_at = v_deleted_at
   WHERE user_id = v_user_id;

  -- Вход: адрес и телефон обезличены (номер можно зарегистрировать заново,
  -- 0221), пароля нет, связей входа нет.
  DELETE FROM auth.identities WHERE user_id = v_user_id;

  UPDATE auth.users
     SET email = 'deleted-' || v_user_id::text || '@deleted.xtrud.pro',
         phone = NULL,
         encrypted_password = NULL,
         email_change = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         updated_at = v_deleted_at
   WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_at', v_deleted_at
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Каталог: + account_type, legal_name (только у компании), company_verified.
--    Тип результата меняется — DROP + CREATE; права как в живой редакции.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text);
CREATE FUNCTION public.search_masters(p_query text DEFAULT NULL::text, p_l2_id text DEFAULT NULL::text, p_city_id text DEFAULT NULL::text, p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_l1_id text DEFAULT NULL::text, p_sort text DEFAULT 'rating'::text, p_district text DEFAULT NULL::text, p_village text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar_url text, city_id text, city_name text, district text, bio text, experience_years integer, rating_avg numeric, rating_count integer, closed_deals integer, categories text[], is_verified boolean, has_experience_badge boolean, account_type text, legal_name text, company_verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH q AS (
    SELECT nullif(btrim(coalesce(p_query, '')), '') AS text_query
  ),
  candidates AS (
    SELECT
      mp.user_id, u.first_name, u.last_name, u.avatar_url, u.city_id,
      c.name AS city_name, u.district, mp.bio, mp.experience_years,
      mp.rating_overall_avg AS rating_avg, mp.rating_overall_count AS rating_count,
      mp.closed_deals, mp.ranking_score, mp.availability_status,
      (mp.verification_level >= 2) AS is_verified,
      (mp.experience_badge_at IS NOT NULL) AS has_experience_badge,
      mp.account_type::text AS account_type,
      CASE WHEN mp.account_type = 'company' THEN mp.legal_name END AS legal_name,
      (mp.account_type = 'company' AND mp.company_verified_at IS NOT NULL) AS company_verified,
      coalesce(array_agg(DISTINCT l2.name_ru) FILTER (WHERE l2.name_ru IS NOT NULL), ARRAY[]::text[]) AS categories
    FROM public.master_profiles mp
    JOIN public.users u ON u.id = mp.user_id
    LEFT JOIN public.cities c ON c.id = u.city_id
    LEFT JOIN public.master_categories mc ON mc.master_id = mp.user_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
    WHERE mp.status = 'active'
      AND coalesce(mp.is_hidden_from_search, false) = false
      AND coalesce(mp.hidden_by_owner, false) = false
      AND u.status = 'active'
      AND u.onboarding_completed_at IS NOT NULL
      AND (NOT p_hide_demo OR coalesce(u.is_demo, false) = false)
      -- Место (0192, 0212): место не выбрано; либо город самого специалиста
      -- равен выбранному; либо зон нет — «вся Ингушетия»; либо зона
      -- специалиста совпадает с выбранным местом (район включает свои города
      -- и сёла, город и село одного района не совпадают).
      AND (
        (p_city_id IS NULL AND p_district IS NULL AND p_village IS NULL)
        OR (p_city_id IS NOT NULL AND u.city_id = p_city_id)
        OR NOT EXISTS (
          SELECT 1 FROM public.master_service_areas msa WHERE msa.master_id = mp.user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.master_service_areas msa
           WHERE msa.master_id = mp.user_id
             AND xtrud_private.area_matches_place(msa.kind::text, msa.location_id,
                                                  p_city_id, p_district, p_village)
        )
      )
      AND (p_l2_id IS NULL OR EXISTS (
            SELECT 1 FROM public.master_categories x WHERE x.master_id = mp.user_id AND x.l2_id = p_l2_id))
      AND (p_l1_id IS NULL OR EXISTS (
            SELECT 1 FROM public.master_categories x JOIN public.categories_l2 xl2 ON xl2.id = x.l2_id
             WHERE x.master_id = mp.user_id AND xl2.l1_id = p_l1_id))
    GROUP BY mp.user_id, u.first_name, u.last_name, u.avatar_url, u.city_id, c.name, u.district,
             mp.bio, mp.experience_years, mp.rating_overall_avg, mp.rating_overall_count,
             mp.closed_deals, mp.ranking_score, mp.availability_status, mp.verification_level,
             mp.experience_badge_at, mp.account_type, mp.legal_name, mp.company_verified_at
  )
  SELECT cand.user_id, cand.first_name, cand.last_name, cand.avatar_url, cand.city_id, cand.city_name,
         cand.district, cand.bio, cand.experience_years, cand.rating_avg, cand.rating_count,
         cand.closed_deals, cand.categories, cand.is_verified, cand.has_experience_badge,
         cand.account_type, cand.legal_name, cand.company_verified
  FROM candidates cand, q
  WHERE q.text_query IS NULL
     OR btrim(coalesce(cand.first_name, '') || ' ' || coalesce(cand.last_name, '')) ILIKE '%' || q.text_query || '%'
     OR cand.legal_name ILIKE '%' || q.text_query || '%'
     OR EXISTS (SELECT 1 FROM unnest(cand.categories) AS category_name WHERE category_name ILIKE '%' || q.text_query || '%')
  ORDER BY
    CASE WHEN p_sort = 'experience' THEN cand.experience_years END DESC NULLS LAST,
    CASE WHEN p_sort = 'availability' THEN
      CASE cand.availability_status::text WHEN 'today' THEN 3 WHEN 'this_week' THEN 2 WHEN 'next_week' THEN 1 ELSE 0 END
    END DESC NULLS LAST,
    -- Проверенные выше (владелец, 2026-10-05, №228): паспорт и «Большой
    -- опыт» — по ступеньке; новички не исчезают, просто ниже.
    (cand.is_verified::int + cand.has_experience_badge::int) DESC,
    cand.ranking_score DESC NULLS LAST,
    cand.closed_deals DESC NULLS LAST,
    cand.rating_avg DESC NULLS LAST,
    -- Уникальный последний ключ: страницы без дублей и пропусков (ревью L3).
    cand.user_id
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$function$;
REVOKE ALL ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Постпроверки.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  -- Значок и название: писать напрямую не может ни одна роль API.
  IF has_column_privilege('authenticated', 'public.master_profiles', 'company_verified_at', 'UPDATE')
     OR has_column_privilege('anon', 'public.master_profiles', 'company_verified_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_profiles', 'company_verified_at', 'INSERT')
     OR has_column_privilege('authenticated', 'public.master_profiles', 'legal_name', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.master_profiles', 'account_type', 'UPDATE') THEN
    RAISE EXCEPTION '0245_master_profiles_writable';
  END IF;
  IF NOT has_column_privilege('anon', 'public.master_profiles', 'company_verified_at', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.master_profiles', 'legal_name', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.master_profiles', 'company_verified_at', 'SELECT') THEN
    RAISE EXCEPTION '0245_public_cannot_read';
  END IF;

  -- Заявки: только SELECT своих строк у authenticated; больше ничего.
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE table_schema = 'public' AND table_name = 'company_verifications'
                AND grantee NOT IN ('postgres'))
     OR EXISTS (SELECT 1 FROM information_schema.column_privileges
                 WHERE table_schema = 'public' AND table_name = 'company_verifications'
                   AND grantee NOT IN ('postgres')
                   AND NOT (grantee = 'authenticated' AND privilege_type = 'SELECT'
                            AND column_name IN ('user_id', 'legal_name', 'instagram', 'whatsapp', 'inn',
                                                'status', 'submitted_at', 'reviewed_at', 'rejection_reason'))) THEN
    RAISE EXCEPTION '0245_company_verifications_grants_wrong';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.company_verifications'::regclass)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.company_verifications'::regclass) <> 1 THEN
    RAISE EXCEPTION '0245_company_verifications_rls_wrong';
  END IF;

  -- Функции: SECURITY DEFINER, права.
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.prosecdef,
           (SELECT array_agg(DISTINCT coalesce(a.grantee::regrole::text, 'PUBLIC') ORDER BY coalesce(a.grantee::regrole::text, 'PUBLIC'))
              FROM aclexplode(p.proacl) a WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> 0) AS roles,
           EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS has_public
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('submit_company_verification', 'set_account_type', 'my_company_verification',
                         'admin_list_company_verifications', 'admin_review_company_verification',
                         'admin_revoke_company', 'search_masters')
  LOOP
    IF NOT r.prosecdef OR r.has_public
       OR r.roles IS DISTINCT FROM (CASE
            WHEN r.sig::text LIKE 'search_masters(%' THEN ARRAY['anon', 'authenticated', 'postgres', 'service_role']
            ELSE ARRAY['authenticated', 'postgres', 'service_role'] END) THEN
      RAISE EXCEPTION '0245_acl_wrong: % %', r.sig, r.roles;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('submit_company_verification', 'set_account_type', 'my_company_verification',
                           'admin_list_company_verifications', 'admin_review_company_verification',
                           'admin_revoke_company', 'search_masters')) <> 7 THEN
    RAISE EXCEPTION '0245_function_count_wrong';
  END IF;
  IF has_function_privilege('authenticated', 'xtrud_private.company_verification_state(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'xtrud_private.company_verification_state(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.company_name_valid(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'xtrud_private.company_name_valid(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0245_private_helper_exposed';
  END IF;
  -- Подтверждение компаний — только админ (ревью §1).
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('admin_list_company_verifications',
                                  'admin_review_company_verification', 'admin_revoke_company')
                AND (p.prosrc LIKE '%is_staff_session%' OR p.prosrc NOT LIKE '%IF NOT public.is_admin_session() THEN%')) THEN
    RAISE EXCEPTION '0245_company_admin_only_widened';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
       NOT LIKE '%DELETE FROM public.company_verifications WHERE user_id = v_user_id;%' THEN
    RAISE EXCEPTION '0245_delete_my_account_not_updated';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
