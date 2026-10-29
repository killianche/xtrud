-- 0256: карточка человека в админке — блок «специалист» (№368, 2026-10-29).
--
-- Решение владельца 2026-10-29: админ сам переводит человека «Частный
-- мастер» ↔ «Компания» (admin_set_account_type, 0255). Чтобы карточка
-- показывала текущий тип и проверки, admin_user_card отдаёт ключ 'master'.
-- Было: живое тело 2026-10-29 (в откате). Стало: + 'master' (account_type,
-- legal_name — публичное название, company_verified, verified, статусы
-- заявок паспорта и компании, experience_badge). Без телефонов, WhatsApp и
-- ИНН — блок безопасен и для управляющего. Права не меняются.
-- Откат: 0256_admin_user_card_master_rollback.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.admin_user_card(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card jsonb;
  v_admin boolean;
BEGIN
  IF NOT public.is_staff_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  -- Телефон и логин — персональные данные: только админу (0239, §2).
  v_admin := public.is_admin_session();

  SELECT jsonb_build_object(
           'user', jsonb_build_object(
             'id', u.id,
             'first_name', u.first_name,
             'last_name', u.last_name,
             'username', u.username,
             'phone', CASE WHEN v_admin THEN up.phone END,
             'login_email', CASE WHEN v_admin THEN au.email END,
             'status', u.status::text,
             'is_master', u.is_master,
             'is_admin', u.is_admin,
             'created_at', u.created_at,
             'last_sign_in_at', au.last_sign_in_at,
             'city_id', u.city_id,
             'district', u.district
           ),
           'orders', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', o.id, 'title', o.title,
                      'status', o.status::text, 'created_at', o.created_at)
                    ORDER BY o.created_at DESC)
               FROM (SELECT * FROM public.orders WHERE client_id = u.id
                     ORDER BY created_at DESC LIMIT 20) o
           ), '[]'::jsonb),
           'responses', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', r.id, 'order_id', r.order_id,
                      'status', r.status::text, 'created_at', r.created_at)
                    ORDER BY r.created_at DESC)
               FROM (SELECT * FROM public.order_responses WHERE master_id = u.id
                     ORDER BY created_at DESC LIMIT 20) r
           ), '[]'::jsonb),
           'reviews', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', rv.id, 'rating', rv.rating,
                      'status', rv.status::text, 'created_at', rv.created_at)
                    ORDER BY rv.created_at DESC)
               FROM (SELECT * FROM public.reviews WHERE target_id = u.id
                     ORDER BY created_at DESC LIMIT 20) rv
           ), '[]'::jsonb),
           -- Специалист (0256, №368): тип аккаунта и проверки — для карточки
           -- «Частный мастер / Компания» в админке. NULL — не специалист.
           'master', (
             SELECT jsonb_build_object(
                      'account_type', m.account_type::text,
                      'legal_name', m.legal_name,
                      'company_verified', m.company_verified_at IS NOT NULL,
                      'verified', coalesce(m.verification_level >= 2, false),
                      'passport_status', coalesce(mv.status::text, 'none'),
                      'company_status', coalesce(cv.status, 'none'),
                      'experience_badge', m.experience_badge_at IS NOT NULL)
               FROM public.master_profiles m
               LEFT JOIN public.master_verifications mv ON mv.user_id = m.user_id
               LEFT JOIN public.company_verifications cv ON cv.user_id = m.user_id
              WHERE m.user_id = u.id)
         )
    INTO v_card
    FROM public.users u
    LEFT JOIN public.users_private up ON up.user_id = u.id
    LEFT JOIN auth.users au ON au.id = u.id
   WHERE u.id = p_user_id;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  RETURN v_card;
END;
$function$;
NOTIFY pgrst, 'reload schema';
COMMIT;
