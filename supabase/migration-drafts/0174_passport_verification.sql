-- 0174: подтверждение паспорта специалиста.
-- DECISION владельца 2026-09-07: «в аккаунте — возможность подтвердить
-- паспорт: человек отправляет фото, оно приходит в админку, админ
-- подтверждает, появляется значок».
--
-- Что уже было (0070): таблица master_verifications (selfie + паспорт,
-- статусы pending/approved/rejected), приватный бакет master-verifications с
-- политиками «свой каталог». Не было: RPC админки, доступа админа к файлам,
-- признака «проверен» в выдаче; триггер ставил verification_level 1/0, а
-- 1 — значение по умолчанию у всех, 0 нарушает CHECK (>= 1).
--
-- Модель: одно фото (главный разворот паспорта), селфи не обязательно.
-- verification_level: 1 — не проверен, 2 — паспорт подтверждён админом.

BEGIN;

-- 1. Анону таблица не нужна вовсе.
REVOKE ALL ON public.master_verifications FROM anon;

-- 2. Селфи не обязательно.
ALTER TABLE public.master_verifications ALTER COLUMN selfie_path DROP NOT NULL;
ALTER TABLE public.master_verifications
  DROP CONSTRAINT IF EXISTS master_verifications_paths_nonempty;
ALTER TABLE public.master_verifications
  ADD CONSTRAINT master_verifications_paths_nonempty CHECK (
    length(passport_main_path) > 0 AND (selfie_path IS NULL OR length(selfie_path) > 0)
  );

-- 3. Повторная отправка: можно заменить фото и пока заявка на проверке.
DROP POLICY IF EXISTS master_verifications_owner_resubmit ON public.master_verifications;
CREATE POLICY master_verifications_owner_resubmit
  ON public.master_verifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending', 'rejected'))
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND rejection_reason IS NULL
  );

-- 4. Уровень: approved → 2, иначе → 1.
CREATE OR REPLACE FUNCTION public.sync_master_verification_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.master_profiles
     SET verification_level = CASE WHEN NEW.status = 'approved' THEN 2 ELSE 1 END,
         updated_at = now()
   WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_verification_level_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.master_profiles
     SET verification_level = 1, updated_at = now()
   WHERE user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

-- Пересчёт по факту: подтверждённых заявок сейчас нет → у всех 1.
UPDATE public.master_profiles mp
   SET verification_level = CASE
     WHEN EXISTS (SELECT 1 FROM public.master_verifications v
                   WHERE v.user_id = mp.user_id AND v.status = 'approved') THEN 2
     ELSE 1 END
 WHERE mp.verification_level IS DISTINCT FROM CASE
     WHEN EXISTS (SELECT 1 FROM public.master_verifications v
                   WHERE v.user_id = mp.user_id AND v.status = 'approved') THEN 2
     ELSE 1 END;

-- 5. Админ читает файлы бакета (подписанные ссылки в панели).
DROP POLICY IF EXISTS master_verifications_admin_select ON storage.objects;
CREATE POLICY master_verifications_admin_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'master-verifications' AND public.is_admin_session());

-- 6. Админка: очередь заявок.
CREATE OR REPLACE FUNCTION public.admin_list_verifications(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  user_id uuid, first_name text, last_name text, phone text,
  status text, passport_main_path text, selfie_path text,
  submitted_at timestamptz, reviewed_at timestamptz, rejection_reason text,
  verification_level integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT v.user_id, u.first_name, u.last_name, u.contact_phone,
         v.status::text, v.passport_main_path, v.selfie_path,
         v.submitted_at, v.reviewed_at, v.rejection_reason,
         mp.verification_level
    FROM public.master_verifications v
    JOIN public.users u ON u.id = v.user_id
    LEFT JOIN public.master_profiles mp ON mp.user_id = v.user_id
   WHERE public.is_admin_session()
     AND (p_status IS NULL OR p_status = '' OR v.status::text = p_status)
   ORDER BY v.submitted_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
$$;
REVOKE ALL ON FUNCTION public.admin_list_verifications(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_verifications(text, integer, integer) TO authenticated;

-- 7. Админка: решение по заявке. Человек получает уведомление.
CREATE OR REPLACE FUNCTION public.admin_review_verification(
  p_user_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_verifications WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'verification_not_found' USING errcode = 'P0002';
  END IF;
  IF NOT p_approve AND v_reason IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  UPDATE public.master_verifications
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END::public.verification_status,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         rejection_reason = CASE WHEN p_approve THEN NULL ELSE v_reason END
   WHERE user_id = p_user_id;

  INSERT INTO public.admin_actions (admin_id, target_type, target_id, action, reason, details)
  VALUES (auth.uid(), 'user', p_user_id,
          CASE WHEN p_approve THEN 'verification_approve' ELSE 'verification_reject' END,
          COALESCE(v_reason, 'Паспорт подтверждён'), '{}'::jsonb);

  PERFORM public.notify_user(
    p_user_id,
    CASE WHEN p_approve THEN 'Личность подтверждена' ELSE 'Паспорт не подтверждён' END,
    CASE WHEN p_approve
         THEN 'В вашем профиле появился значок проверенного специалиста.'
         ELSE 'Причина: ' || v_reason || '. Отправьте новое фото в разделе «Я специалист».' END,
    jsonb_build_object('type', CASE WHEN p_approve THEN 'verification_approved' ELSE 'verification_rejected' END)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_verification(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, boolean, text) TO authenticated;

-- 8. Поиск: признак «проверен» в выдаче. Тип результата меняется — функцию
--    пересоздаём; права возвращаем те же (anon, authenticated).
DROP FUNCTION IF EXISTS public.search_masters(text, text, text, boolean, integer, integer, text, text);
CREATE FUNCTION public.search_masters(
  p_query text DEFAULT NULL, p_l2_id text DEFAULT NULL, p_city_id text DEFAULT NULL,
  p_hide_demo boolean DEFAULT true, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0,
  p_l1_id text DEFAULT NULL, p_sort text DEFAULT 'rating'
)
RETURNS TABLE(
  user_id uuid, first_name text, last_name text, avatar_url text, city_id text,
  city_name text, district text, bio text, experience_years integer,
  rating_avg numeric, rating_count integer, closed_deals integer, categories text[],
  is_verified boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH q AS (
    SELECT nullif(btrim(coalesce(p_query, '')), '') AS text_query
  ),
  candidates AS (
    SELECT
      mp.user_id,
      u.first_name,
      u.last_name,
      u.avatar_url,
      u.city_id,
      c.name        AS city_name,
      u.district,
      mp.bio,
      mp.experience_years,
      mp.rating_overall_avg   AS rating_avg,
      mp.rating_overall_count AS rating_count,
      mp.closed_deals,
      mp.ranking_score,
      mp.availability_status,
      (mp.verification_level >= 2) AS is_verified,
      coalesce(
        array_agg(DISTINCT l2.name_ru) FILTER (WHERE l2.name_ru IS NOT NULL),
        ARRAY[]::text[]
      ) AS categories
    FROM public.master_profiles mp
    JOIN public.users u ON u.id = mp.user_id
    LEFT JOIN public.cities c ON c.id = u.city_id
    LEFT JOIN public.master_categories mc ON mc.master_id = mp.user_id
    LEFT JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
    WHERE mp.status = 'active'
      AND coalesce(mp.is_hidden_from_search, false) = false
      AND u.status = 'active'
      AND u.onboarding_completed_at IS NOT NULL
      AND (NOT p_hide_demo OR coalesce(u.is_demo, false) = false)
      AND (p_city_id IS NULL OR u.city_id = p_city_id)
      AND (
        p_l2_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.master_categories x
           WHERE x.master_id = mp.user_id AND x.l2_id = p_l2_id
        )
      )
      AND (
        p_l1_id IS NULL
        OR EXISTS (
          SELECT 1
            FROM public.master_categories x
            JOIN public.categories_l2 xl2 ON xl2.id = x.l2_id
           WHERE x.master_id = mp.user_id AND xl2.l1_id = p_l1_id
        )
      )
    GROUP BY mp.user_id, u.first_name, u.last_name, u.avatar_url, u.city_id,
             c.name, u.district, mp.bio, mp.experience_years,
             mp.rating_overall_avg, mp.rating_overall_count, mp.closed_deals,
             mp.ranking_score, mp.availability_status, mp.verification_level
  )
  SELECT
    cand.user_id, cand.first_name, cand.last_name, cand.avatar_url,
    cand.city_id, cand.city_name, cand.district, cand.bio,
    cand.experience_years, cand.rating_avg, cand.rating_count,
    cand.closed_deals, cand.categories, cand.is_verified
  FROM candidates cand, q
  WHERE q.text_query IS NULL
     OR btrim(coalesce(cand.first_name, '') || ' ' || coalesce(cand.last_name, ''))
        ILIKE '%' || q.text_query || '%'
     OR EXISTS (
       SELECT 1 FROM unnest(cand.categories) AS category_name
        WHERE category_name ILIKE '%' || q.text_query || '%'
     )
  ORDER BY
    CASE WHEN p_sort = 'experience' THEN cand.experience_years END DESC NULLS LAST,
    CASE WHEN p_sort = 'availability' THEN
      CASE cand.availability_status::text
        WHEN 'today' THEN 3 WHEN 'this_week' THEN 2 WHEN 'next_week' THEN 1 ELSE 0
      END
    END DESC NULLS LAST,
    cand.ranking_score DESC NULLS LAST,
    cand.closed_deals DESC NULLS LAST,
    cand.rating_avg DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;
GRANT EXECUTE ON FUNCTION public.search_masters(text, text, text, boolean, integer, integer, text, text)
  TO anon, authenticated, service_role;

COMMIT;
