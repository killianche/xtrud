-- Откат 0245: подтверждение компании.
--
-- Возвращает живые редакции до 0245 (снимок 2026-10-08): страж
-- master_profiles_moderation_guard, delete_my_account (md5 prosrc
-- 51d41114194685f29243be370da994e0), search_masters (md5 functiondef
-- c44729c5a91dff16cd0fa56c99b54ba8) с прежними правами; удаляет функции,
-- таблицу заявок, столбец company_verified_at и ограничения; гостю снова не
-- виден legal_name.
--
-- Данные: заявки и значки теряются (журнал admin_actions хранит
-- legal_name/instagram в details). account_type и legal_name, выставленные
-- через set_account_type, остаются (столбцы существовали до 0245).
-- Instagram, записанный при подтверждении, остаётся в профиле и в
-- instagram_requests (он проверен админом).
-- Ограничение журнала возвращается к редакции до 0245, только если записей
-- company_* нет (журнал append-only).
--
-- ВНИМАНИЕ (ревью xtrud-security §5): откат допустим только до выхода
-- клиентской сборки, запрашивающей master_profiles.legal_name /
-- company_verified_at. После неё откат уберёт столбец (и чтение legal_name
-- гостем) — REST-запрос профиля мастера упадёт целиком. Тогда — только
-- forward-исправление.
--
-- Предусловие: текущие тела delete_my_account, search_masters и стража — ровно
-- редакция 0245 (иначе их правили после 0245, и откат затёр бы чужое).
-- Применять от postgres: psql -v ON_ERROR_STOP=1 -q.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0245_rollback_must_run_as_postgres';
  END IF;
  IF to_regclass('public.company_verifications') IS NULL THEN
    RAISE EXCEPTION '0245_not_applied';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
       IS DISTINCT FROM 'a4cf4e35ca1bb95e1d84924bf66c188d'
     OR md5(pg_get_functiondef('public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)'::regprocedure))
       IS DISTINCT FROM '20bb5d9e7e36bbc0b03ab3de2202cbb3'
     OR md5(pg_get_functiondef('xtrud_private.guard_master_profile_moderation()'::regprocedure))
       IS DISTINCT FROM 'b880d6ff6e1db1aa9dd9582c76c15785' THEN
    RAISE EXCEPTION '0245_rollback_bodies_changed_after_0245';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.admin_revoke_company(uuid, text);
DROP FUNCTION IF EXISTS public.admin_review_company_verification(uuid, boolean, text, integer);
DROP FUNCTION IF EXISTS public.admin_list_company_verifications(text, integer);
DROP FUNCTION IF EXISTS public.my_company_verification();
DROP FUNCTION IF EXISTS public.set_account_type(text, text);
DROP FUNCTION IF EXISTS public.submit_company_verification(text, text, text, text);

-- search_masters — живая редакция до 0245.
DROP FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text, text, text);
CREATE OR REPLACE FUNCTION public.search_masters(p_query text DEFAULT NULL::text, p_l2_id text DEFAULT NULL::text, p_city_id text DEFAULT NULL::text, p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_l1_id text DEFAULT NULL::text, p_sort text DEFAULT 'rating'::text, p_district text DEFAULT NULL::text, p_village text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar_url text, city_id text, city_name text, district text, bio text, experience_years integer, rating_avg numeric, rating_count integer, closed_deals integer, categories text[], is_verified boolean, has_experience_badge boolean)
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
             mp.experience_badge_at
  )
  SELECT cand.user_id, cand.first_name, cand.last_name, cand.avatar_url, cand.city_id, cand.city_name,
         cand.district, cand.bio, cand.experience_years, cand.rating_avg, cand.rating_count,
         cand.closed_deals, cand.categories, cand.is_verified, cand.has_experience_badge
  FROM candidates cand, q
  WHERE q.text_query IS NULL
     OR btrim(coalesce(cand.first_name, '') || ' ' || coalesce(cand.last_name, '')) ILIKE '%' || q.text_query || '%'
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

-- delete_my_account — живая редакция после 0244.
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

-- Страж — живая редакция после 0244.
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

  RETURN NEW;
END
$function$;

DROP FUNCTION IF EXISTS xtrud_private.company_verification_state(uuid);
DROP FUNCTION IF EXISTS xtrud_private.company_name_valid(text);
DROP TABLE IF EXISTS public.company_verifications;

REVOKE SELECT (legal_name) ON public.master_profiles FROM anon;
ALTER TABLE public.master_profiles DROP CONSTRAINT IF EXISTS master_profiles_legal_name_not_solo;
ALTER TABLE public.master_profiles DROP CONSTRAINT IF EXISTS master_profiles_company_verified_only_company;
ALTER TABLE public.master_profiles DROP COLUMN IF EXISTS company_verified_at;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_actions
                  WHERE action IN ('company_approve', 'company_reject', 'company_revoke')) THEN
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
        'staff_role_set', 'order_test_mark'
      ]::text[]));
  END IF;
END $$;

-- Постпроверки: живые редакции восстановлены байт в байт.
DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.delete_my_account()'::regprocedure)
       IS DISTINCT FROM '51d41114194685f29243be370da994e0' THEN
    RAISE EXCEPTION '0245_rollback_delete_my_account_mismatch';
  END IF;
  IF md5(pg_get_functiondef('public.search_masters(text,text,text,boolean,integer,integer,text,text,text,text)'::regprocedure))
       IS DISTINCT FROM 'c44729c5a91dff16cd0fa56c99b54ba8' THEN
    RAISE EXCEPTION '0245_rollback_search_masters_mismatch';
  END IF;
  IF md5(pg_get_functiondef('xtrud_private.guard_master_profile_moderation()'::regprocedure))
       IS DISTINCT FROM '70c88c1fccc8024c91271f2d71853e8c' THEN
    RAISE EXCEPTION '0245_rollback_guard_mismatch';
  END IF;
  IF has_column_privilege('anon', 'public.master_profiles', 'legal_name', 'SELECT') THEN
    RAISE EXCEPTION '0245_rollback_legal_name_still_public';
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conrelid = 'public.admin_actions'::regclass AND conname = 'admin_actions_action_check')
     IS DISTINCT FROM 'c82599cfcb8dd33ebe110b9016305873'
     AND NOT EXISTS (SELECT 1 FROM public.admin_actions
                      WHERE action IN ('company_approve', 'company_reject', 'company_revoke')) THEN
    RAISE EXCEPTION '0245_rollback_action_check_mismatch';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
