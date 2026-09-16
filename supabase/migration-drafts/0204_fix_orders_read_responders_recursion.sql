-- 0204: «Ошибка сервера» при повторном отклике (владелец, 2026-09-16).
--
-- FACT (лог xtrud-api, 16.09 19:05 UTC, сборка 97): submit_order_response →
-- «infinite recursion detected in policy for relation order_responses» (42P17).
-- Причина — политика orders_read_responders из 0196: она читала
-- order_responses под RLS, а политика order_responses_update_own_or_client
-- читает orders. Оживление отозванного отклика (UPDATE order_responses) шло по
-- кругу orders → order_responses → orders. Сломано с 13.09.
--
-- Исправление — тот же приём, что у xtrud_private.order_client_id: проверка
-- в SECURITY DEFINER-функции с row_security = off, политика вызывает её.
-- Применено на Beget 2026-09-16.

BEGIN;

CREATE OR REPLACE FUNCTION xtrud_private.user_responded_to_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.order_responses r
     WHERE r.order_id = p_order_id AND r.master_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION xtrud_private.user_responded_to_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION xtrud_private.user_responded_to_order(uuid) TO authenticated;

DROP POLICY IF EXISTS orders_read_responders ON public.orders;
CREATE POLICY orders_read_responders ON public.orders
  FOR SELECT TO authenticated
  USING (xtrud_private.user_responded_to_order(id));

COMMIT;
