-- 0207: «Пока нет откликов» — только заданиям, где отклики включены.
--
-- Аудит 2026-09-22 (docs/audit-2026-09/01-product.md §2.1), владелец в тот же
-- день: напоминание уходило и заданиям «звоните напрямую» (contact_mode =
-- 'phone_open'), где откликов в приложении не бывает по устройству — 3 из 9
-- таких уведомлений. Теперь такие задания пропускаются.
-- Остальное тело функции — как на Beget (снято pg_get_functiondef 2026-09-22).
--
-- Откат: убрать условие contact_mode из WHERE.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_orders_without_responses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order record;
  v_sent int := 0;
BEGIN
  FOR v_order IN
    SELECT o.id, o.client_id, o.title
      FROM public.orders o
     WHERE o.status = 'open'
       AND o.contact_mode IS DISTINCT FROM 'phone_open'
       AND coalesce(o.responses_count, 0) = 0
       AND o.created_at < now() - interval '24 hours'
       AND o.created_at > now() - interval '14 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.user_id = o.client_id
            AND n.data->>'type' = 'order_no_responses'
            AND n.data->>'order_id' = o.id::text)
  LOOP
    PERFORM public.notify_user(
      v_order.client_id, 'Пока нет откликов',
      LEFT(COALESCE(v_order.title, ''), 120)
        || E'\nСовет: добавьте фото и бюджет, уточните описание — или выберите специалиста из каталога сами.',
      jsonb_build_object('type', 'order_no_responses', 'order_id', v_order.id));
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$function$;

COMMIT;
