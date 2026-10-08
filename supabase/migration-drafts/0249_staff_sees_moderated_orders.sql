-- 0249: админ и управляющий открывают задание, даже если оно скрыто
-- блокировкой или «красным флагом» (№327, 2026-10-08).
--
-- Видео владельца (ttt.MP4): push «Новое задание без категории» → «Без
-- категории» → касание задания → «Задание недоступно». FACT: задание
-- a8ce5a3f… открыто и не скрыто, но между аккаунтом админа и автором
-- задания есть блокировка (user_blocks). Ограничивающая политика
-- orders_block_relation_restrictive прячет задания заблокированных друг от
-- друга людей — и от сотрудника тоже, хотя список «Без категории» (функция
-- admin_list_uncategorized_orders) задание показывает.
-- То же у orders_red_flag_restrictive: shadow_hidden_order_ids пускает
-- только админа, а раздел «Скрытые задания» открыт и управляющему (0239).
--
-- Стало: обе политики дополнены «или смотрит сотрудник»
-- (xtrud_private.viewer_is_staff() = is_staff_session(): админ или
-- управляющий, активный, не демо). Гостю функция отвечает false; права на
-- неё у anon есть, потому что политики действуют и для гостей.
-- Блокировка для обычных людей работает как раньше.
--
-- Откат: 0249_staff_sees_moderated_orders_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0249_must_run_as_postgres';
  END IF;
  IF (SELECT md5(pg_get_expr(polqual, polrelid)) FROM pg_policy
       WHERE polrelid = 'public.orders'::regclass AND polname = 'orders_block_relation_restrictive')
     IS DISTINCT FROM 'cc60de0674d634747901cd060bd0fb73'
     OR (SELECT md5(pg_get_expr(polqual, polrelid)) FROM pg_policy
          WHERE polrelid = 'public.orders'::regclass AND polname = 'orders_red_flag_restrictive')
     IS DISTINCT FROM '77c55f4e61afa0f9023862f58d762862' THEN
    RAISE EXCEPTION '0249_policies_changed';
  END IF;
END;
$$;

CREATE FUNCTION xtrud_private.viewer_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.is_staff_session();
$function$;
REVOKE ALL ON FUNCTION xtrud_private.viewer_is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION xtrud_private.viewer_is_staff() TO anon, authenticated, service_role;

ALTER POLICY orders_block_relation_restrictive ON public.orders
  USING ((( SELECT auth.uid() AS uid) IS NULL) OR (client_id = ( SELECT auth.uid() AS uid))
         OR (NOT (client_id = ANY (COALESCE(( SELECT xtrud_private.current_user_blocked_counterparties() AS current_user_blocked_counterparties), ARRAY[]::uuid[]))))
         OR ( SELECT xtrud_private.viewer_is_staff() AS viewer_is_staff));

ALTER POLICY orders_red_flag_restrictive ON public.orders
  USING ((client_id = ( SELECT auth.uid() AS uid)) OR (picked_master_id = ( SELECT auth.uid() AS uid))
         OR (NOT (id = ANY (COALESCE(( SELECT xtrud_private.shadow_hidden_order_ids() AS shadow_hidden_order_ids), '{}'::uuid[]))))
         OR ( SELECT xtrud_private.viewer_is_staff() AS viewer_is_staff));

NOTIFY pgrst, 'reload schema';

COMMIT;
