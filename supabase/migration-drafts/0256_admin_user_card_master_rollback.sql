-- Откат 0256: живое тело admin_user_card до 0256 (2026-10-29).
BEGIN;
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
           ), '[]'::jsonb)
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
