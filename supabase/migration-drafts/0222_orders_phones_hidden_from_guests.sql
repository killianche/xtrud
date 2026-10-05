-- 0222: телефоны заданий не видны гостю (аудит перед выставкой №161; №225).
--
-- Владелец, 2026-10-05: «исправь ошибки». Аудит: anon читал public.orders
-- целиком (право на таблицу), включая contact_phone и whatsapp_phone
-- открытых заданий «звоните напрямую» — любой без входа получал номера
-- клиентов запросом к API. В приложении гостю номер и так не показывается
-- (GuestContactGate), вошедшим — как раньше.
--
-- Было: anon — SELECT на всю таблицу orders.
-- Стало: anon — SELECT на все колонки, кроме contact_phone и whatsapp_phone.
--   Приложение (сборка 129+) для гостя запрашивает явный список колонок.
--   Старые сборки читали «*» и для гостя получат отказ — гостевой режим сейчас
--   выключен флагом require_login.
--
-- Откат: 0222_orders_phones_hidden_from_guests_rollback.sql.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0222_must_run_as_postgres';
  END IF;
  IF NOT has_column_privilege('anon', 'public.orders', 'contact_phone', 'SELECT') THEN
    RAISE EXCEPTION '0222_already_applied';
  END IF;
END;
$$;

REVOKE SELECT ON public.orders FROM anon;
GRANT SELECT (
  id, client_id, l2_id, l3_ids, title, description, city_id, district, urgency,
  executor_type, contact_mode, status, picked_master_id, responses_count,
  created_at, updated_at, expires_at, completed_at, created_via, budget_kind,
  budget_value, picked_at, master_marked_done_at, awaiting_confirmation_until,
  completion_kind, last_activity_at, cancelled_by, cancel_reason,
  dispute_opened_by, dispute_reason, disputed_at, resolved_at, resolved_by,
  resolution_kind, photo_urls, contact_name, preferred_date, address, extra_l2_ids
) ON public.orders TO anon;

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.orders', 'contact_phone', 'SELECT')
     OR has_column_privilege('anon', 'public.orders', 'whatsapp_phone', 'SELECT') THEN
    RAISE EXCEPTION '0222_phones_still_readable';
  END IF;
  IF NOT has_column_privilege('anon', 'public.orders', 'title', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.orders', 'contact_phone', 'SELECT') THEN
    RAISE EXCEPTION '0222_lost_needed_access';
  END IF;
  -- Все прочие колонки на месте: новых колонок без права у гостя быть не должно.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'orders'
       AND c.column_name NOT IN ('contact_phone', 'whatsapp_phone')
       AND NOT has_column_privilege('anon', 'public.orders', c.column_name, 'SELECT')) THEN
    RAISE EXCEPTION '0222_column_list_incomplete';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
