-- Откат 0249: политики — как до неё, функция удаляется.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER POLICY orders_block_relation_restrictive ON public.orders
  USING ((( SELECT auth.uid() AS uid) IS NULL) OR (client_id = ( SELECT auth.uid() AS uid))
         OR (NOT (client_id = ANY (COALESCE(( SELECT xtrud_private.current_user_blocked_counterparties() AS current_user_blocked_counterparties), ARRAY[]::uuid[])))));

ALTER POLICY orders_red_flag_restrictive ON public.orders
  USING ((client_id = ( SELECT auth.uid() AS uid)) OR (picked_master_id = ( SELECT auth.uid() AS uid))
         OR (NOT (id = ANY (COALESCE(( SELECT xtrud_private.shadow_hidden_order_ids() AS shadow_hidden_order_ids), '{}'::uuid[])))));

DROP FUNCTION xtrud_private.viewer_is_staff();

DO $$
BEGIN
  IF (SELECT md5(pg_get_expr(polqual, polrelid)) FROM pg_policy
       WHERE polrelid = 'public.orders'::regclass AND polname = 'orders_block_relation_restrictive')
     IS DISTINCT FROM 'cc60de0674d634747901cd060bd0fb73'
     OR (SELECT md5(pg_get_expr(polqual, polrelid)) FROM pg_policy
          WHERE polrelid = 'public.orders'::regclass AND polname = 'orders_red_flag_restrictive')
     IS DISTINCT FROM '77c55f4e61afa0f9023862f58d762862' THEN
    RAISE EXCEPTION '0249r_policy_md5';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
