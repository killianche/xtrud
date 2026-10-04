-- 0217: кто может откликнуться на задание (владелец, 2026-10-04, очередь №203).
--
-- Было (FACT): откликнуться мог любой вошедший — категории специалиста не
-- проверяли ни приложение, ни база. «Будучи специалистом без категорий, я
-- мог откликнуться.»
--
-- Решение (docs/RESPONSE_ELIGIBILITY_2026-10.md): у подкатегории флаг
-- open_responses.
--   - открытые (разнорабочие, уборка, грузчики, курьеры…) — откликается
--     любой вошедший;
--   - остальные — только тот, у кого в профиле специалиста есть категория
--     задания (основная или одна из дополнительных).
-- Профиль специалиста есть у каждого (0186), так что не хватать может только
-- категории — приложение предлагает её добавить (can_respond_to_order), а
-- база отказывает понятным текстом при отклике (триггер — и для старых
-- сборок). Флаг меняется в админке («Каталог»).
--
-- Заодно (№202, тот же день): флаг require_login — приложение сразу просит
-- номер и пароль, гостей нет. Флаг выключается в админке («Настройки») —
-- если App Review попросит доступ без входа, откат без новой сборки.
--
-- Применять от postgres после 0216. Откат: 0217_response_eligibility_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0217_must_run_as_postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'categories_l2'
                AND column_name = 'open_responses') THEN
    RAISE EXCEPTION '0217_already_applied';
  END IF;
  -- Журнал — в редакции 0216.
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint
       WHERE conname = 'admin_actions_action_check' AND conrelid = 'public.admin_actions'::regclass)
     IS DISTINCT FROM 'e20f24ecd705e628fc7d08c65667f837' THEN
    RAISE EXCEPTION '0217_action_check_not_from_0216';
  END IF;
  IF to_regprocedure('public.admin_list_categories()') IS NULL THEN
    RAISE EXCEPTION '0217_needs_0215';
  END IF;
  -- get_app_flags — в редакции 0216 (с find_tiles).
  IF position('find_tiles' in pg_get_functiondef('public.get_app_flags()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '0217_needs_0216';
  END IF;
END;
$$;

-- 1. Флаг подкатегории.
ALTER TABLE public.categories_l2
  ADD COLUMN open_responses boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.categories_l2.open_responses IS
  'Откликаться может любой вошедший (простые работы). false — только специалист с этой категорией в профиле (0217).';

-- Простые работы, где опыт и профиль не решают (владелец: «разнорабочий,
-- уборка, подобные простые профессии»). Остальное админ меняет в «Каталоге».
UPDATE public.categories_l2 SET open_responses = true
 WHERE id IN (
   'laborers', 'cleaning', 'cleaning-post-renovation', 'housekeeping', 'garden', 'disposal',
   'movers', 'courier-delivery', 'buy-deliver', 'food-delivery', 'promoters',
   'calls-messages', 'info-search'
 );

-- 2. Какая категория мешает откликнуться (NULL — можно).
CREATE FUNCTION xtrud_private.respond_block_category(p_order_id uuid, p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH o AS (
    SELECT ord.l2_id, array_append(coalesce(ord.extra_l2_ids, '{}'::text[]), ord.l2_id) AS cats
      FROM public.orders ord WHERE ord.id = p_order_id
  )
  SELECT CASE
           WHEN o.l2_id IS NULL THEN NULL
           WHEN EXISTS (SELECT 1 FROM public.categories_l2 c
                         WHERE c.id = ANY (o.cats) AND c.open_responses) THEN NULL
           WHEN EXISTS (SELECT 1 FROM public.master_categories mc
                         WHERE mc.master_id = p_user AND mc.l2_id = ANY (o.cats)) THEN NULL
           ELSE o.l2_id
         END
    FROM o;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.respond_block_category(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- 3. Для приложения: спросить заранее.
CREATE FUNCTION public.can_respond_to_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_block text;
BEGIN
  -- Гость: решит вход; правило проверится после него.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;
  v_block := xtrud_private.respond_block_category(p_order_id, v_uid);
  IF v_block IS NULL THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'needs_category',
    'l2_id', v_block,
    'l2_name', (SELECT c.name_ru FROM public.categories_l2 c WHERE c.id = v_block));
END;
$function$;
REVOKE ALL ON FUNCTION public.can_respond_to_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_respond_to_order(uuid) TO authenticated, service_role;

-- 4. База отказывает при отклике (и повторном отклике после отзыва) —
-- понятным текстом, который покажут и старые сборки.
CREATE FUNCTION xtrud_private.order_responses_require_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_block text;
BEGIN
  -- Свой отклик специалист может только отправить или отозвать: «viewed»,
  -- «accepted», «rejected» ставят функции, которые вызывает заказчик.
  -- Иначе старый отклик оживлялся статусом «viewed» мимо проверки категории
  -- (ревью xtrud-security 2026-10-04, F1).
  IF TG_OP = 'UPDATE' AND auth.uid() = NEW.master_id
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('sent', 'withdrawn') THEN
    RAISE EXCEPTION 'response_status_forbidden' USING errcode = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'withdrawn' AND NEW.status = 'sent') THEN
    RETURN NEW;
  END IF;
  v_block := xtrud_private.respond_block_category(NEW.order_id, NEW.master_id);
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION 'Откликаться на такие задания могут специалисты категории «%». Добавьте её в профиль: Аккаунт → Я специалист → Чем занимаетесь.',
      coalesce((SELECT c.name_ru FROM public.categories_l2 c WHERE c.id = v_block), v_block)
      USING errcode = 'P0001', hint = 'needs_category';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION xtrud_private.order_responses_require_category()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER order_responses_require_category
  BEFORE INSERT OR UPDATE OF status ON public.order_responses
  FOR EACH ROW EXECUTE FUNCTION xtrud_private.order_responses_require_category();

-- 5. Админка: флаг в «Каталоге».
ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (action = ANY (ARRAY[
  'warn', 'suspend', 'unsuspend', 'ban', 'unban', 'hide', 'unhide', 'hide_order', 'dismiss_report', 'resolve_report', 'issue_signed_url', 'verification_approve', 'verification_reject', 'master_show', 'master_hide', 'set_password', 'set_phone', 'set_order_limits', 'set_find_screen', 'promo_banner_add', 'promo_banner_update', 'promo_banner_delete', 'resolve_recovery_request', 'restore_order', 'category_show', 'category_hide',
  'set_find_tiles', 'broadcast_push',
  'category_open_responses', 'set_require_login'
]::text[]));

-- 6. Обязательный вход (№202).
INSERT INTO public.app_settings (key, value)
VALUES ('require_login', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

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
               WHERE s.key = 'find_tiles' AND s.value->>'variant' IN ('mosaic', 'grid')), 'grid'),
    'require_login',
    coalesce((SELECT (s.value->>'enabled')::boolean FROM public.app_settings s
               WHERE s.key = 'require_login' AND s.value->>'enabled' IN ('true', 'false')), false)
  );
$$;
REVOKE ALL ON FUNCTION public.get_app_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_flags() TO anon, authenticated, service_role;

CREATE FUNCTION public.admin_set_require_login(p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old text;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'bad_visible' USING errcode = '22023';
  END IF;
  SELECT value->>'enabled' INTO v_old FROM public.app_settings WHERE key = 'require_login';
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('require_login', jsonb_build_object('enabled', p_enabled), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  PERFORM public.admin_log_action(
    'set_require_login', 'settings', '00000000-0000-0000-0000-000000000000'::uuid,
    'Обязательный вход в приложение', NULL,
    jsonb_build_object('old', v_old, 'new', p_enabled));
  RETURN public.get_app_flags();
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_require_login(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_require_login(boolean) TO authenticated, service_role;

DROP FUNCTION public.admin_list_categories();
CREATE FUNCTION public.admin_list_categories()
 RETURNS TABLE(l1_id text, l1_name text, l2_id text, l2_name text, is_active boolean,
               is_visible boolean, sort_order integer, open_orders integer, masters integer,
               open_responses boolean)
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
  SELECT l1.id, l1.name_ru, l2.id, l2.name_ru, l2.is_active, l2.is_visible, l2.sort_order,
         coalesce(oc.n, 0), coalesce(mc.n, 0), l2.open_responses
    FROM public.categories_l2 l2
    JOIN public.categories_l1 l1 ON l1.id = l2.l1_id
    LEFT JOIN (SELECT o.l2_id, count(*)::int AS n FROM public.orders o
                WHERE o.status = 'open' GROUP BY o.l2_id) oc ON oc.l2_id = l2.id
    LEFT JOIN (SELECT m.l2_id, count(DISTINCT m.master_id)::int AS n FROM public.master_categories m
                GROUP BY m.l2_id) mc ON mc.l2_id = l2.id
   ORDER BY l1.sort_order, l1.id, l2.sort_order, l2.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_list_categories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_categories() TO authenticated, service_role;

CREATE FUNCTION public.admin_set_category_open_responses(p_l2_id text, p_open boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;
  IF p_open IS NULL THEN
    RAISE EXCEPTION 'bad_visible' USING errcode = '22023';
  END IF;
  SELECT c.open_responses INTO v_old FROM public.categories_l2 c WHERE c.id = p_l2_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found' USING errcode = 'P0002';
  END IF;
  IF v_old = p_open THEN
    RETURN;
  END IF;
  UPDATE public.categories_l2 SET open_responses = p_open WHERE id = p_l2_id;
  PERFORM public.admin_log_action(
    'category_open_responses', 'category', '00000000-0000-0000-0000-000000000000'::uuid,
    v_reason, NULL, jsonb_build_object('l2_id', p_l2_id, 'old', v_old, 'new', p_open));
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_category_open_responses(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_category_open_responses(text, boolean, text)
  TO authenticated, service_role;

-- Проверки после изменений.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.can_respond_to_order(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'xtrud_private.respond_block_category(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_category_open_responses(text,boolean,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_list_categories()', 'EXECUTE') THEN
    RAISE EXCEPTION '0217_grants_too_wide';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.can_respond_to_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '0217_app_cannot_check';
  END IF;
  IF has_function_privilege('anon', 'public.admin_set_require_login(boolean)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_app_flags()', 'EXECUTE') THEN
    RAISE EXCEPTION '0217_flags_grants';
  END IF;
  IF (SELECT count(*) FROM public.categories_l2 WHERE open_responses) < 5 THEN
    RAISE EXCEPTION '0217_open_list_not_applied';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
