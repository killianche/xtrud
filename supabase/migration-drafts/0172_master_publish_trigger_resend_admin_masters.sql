-- 0172: три исправления по тестированию владельца 2026-09-07.
--
-- 1. FACT: на master_categories не было триггера пересчёта видимости —
--    функция _trg_categories_publish_check существовала, триггер нет.
--    Специалист выбирал категорию и оставался pending/hidden.
-- 2. Повторный отклик после отзыва: UNIQUE(order_id, master_id) не даёт
--    вставить вторую строку — разрешаем мастеру обновить свой отозванный
--    отклик (status withdrawn → sent) с новыми условиями. Клиент получает
--    уведомление как о новом отклике.
-- 3. Админка: список специалистов и управление видимостью в каталоге.

-- 1. Пересчёт видимости при любом изменении категорий.
DROP TRIGGER IF EXISTS master_categories_publish_check ON public.master_categories;
CREATE TRIGGER master_categories_publish_check
  AFTER INSERT OR UPDATE OR DELETE ON public.master_categories
  FOR EACH ROW EXECUTE FUNCTION public._trg_categories_publish_check();

-- 2. Повторный отклик.
GRANT UPDATE (price_kind, price_value, lead_time, message, contact_phone, whatsapp_phone)
  ON public.order_responses TO authenticated;

-- Вернуть в «sent» можно только отозванный отклик, и только на открытое
-- задание с откликами (contact_mode = chat_only). Отклонённый клиентом
-- отклик мастер оживить не может.
CREATE OR REPLACE FUNCTION public.guard_response_resend()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status <> 'sent' THEN
    IF OLD.status <> 'withdrawn' THEN
      RAISE EXCEPTION 'cannot_resend_after_decision' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = NEW.order_id AND o.status = 'open' AND o.contact_mode = 'chat_only'
    ) THEN
      RAISE EXCEPTION 'order_not_accepting_responses' USING ERRCODE = '22023';
    END IF;
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_response_resend() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_responses_guard_resend ON public.order_responses;
CREATE TRIGGER order_responses_guard_resend
  BEFORE UPDATE OF status ON public.order_responses
  FOR EACH ROW EXECUTE FUNCTION public.guard_response_resend();

DROP TRIGGER IF EXISTS order_responses_notify_resend ON public.order_responses;
CREATE TRIGGER order_responses_notify_resend
  AFTER UPDATE OF status ON public.order_responses
  FOR EACH ROW WHEN (OLD.status = 'withdrawn' AND NEW.status = 'sent')
  EXECUTE FUNCTION public.trg_notify_new_response();

-- 3. Админка: специалисты.
CREATE OR REPLACE FUNCTION public.admin_list_masters(p_search text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (
  id uuid, first_name text, last_name text, phone text, user_status text,
  master_status text, is_hidden boolean, categories text[], photos_count bigint,
  rating_avg numeric, rating_count int, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT u.id, u.first_name, u.last_name, u.contact_phone, u.status::text,
         mp.status::text, mp.is_hidden_from_search,
         COALESCE((SELECT array_agg(l2.name_ru ORDER BY l2.name_ru)
                     FROM public.master_categories mc JOIN public.categories_l2 l2 ON l2.id = mc.l2_id
                    WHERE mc.master_id = u.id), ARRAY[]::text[]),
         (SELECT count(*) FROM public.portfolio_items pi WHERE pi.master_id = u.id),
         mp.rating_overall_avg, mp.rating_overall_count, mp.created_at
    FROM public.master_profiles mp
    JOIN public.users u ON u.id = mp.user_id
   WHERE public.is_admin_session()
     AND (p_search IS NULL OR btrim(p_search) = ''
          OR u.first_name ILIKE '%' || p_search || '%'
          OR u.last_name ILIKE '%' || p_search || '%'
          OR u.contact_phone ILIKE '%' || p_search || '%')
   ORDER BY mp.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
$$;
REVOKE ALL ON FUNCTION public.admin_list_masters(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_masters(text, int, int) TO authenticated;

-- Показать/скрыть в каталоге. Скрытый админом — status 'suspended' (его
-- не трогает try_publish_master); показать — 'active' и виден, если есть
-- категория, иначе pending.
CREATE OR REPLACE FUNCTION public.admin_set_master_visibility(p_user_id uuid, p_visible boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'master_not_found' USING errcode = 'P0002';
  END IF;
  IF p_visible THEN
    UPDATE public.master_profiles
       SET status = 'active', is_hidden_from_search = false, updated_at = now()
     WHERE user_id = p_user_id;
    PERFORM public.try_publish_master(p_user_id);
  ELSE
    UPDATE public.master_profiles
       SET status = 'suspended', is_hidden_from_search = true, updated_at = now()
     WHERE user_id = p_user_id;
  END IF;
  INSERT INTO public.admin_actions (admin_id, target_type, target_id, action, reason, details)
  VALUES (auth.uid(), 'user', p_user_id,
          CASE WHEN p_visible THEN 'master_show' ELSE 'master_hide' END,
          COALESCE(NULLIF(btrim(p_reason), ''), CASE WHEN p_visible THEN 'Показан в каталоге' ELSE 'Скрыт из каталога' END),
          '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_master_visibility(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_master_visibility(uuid, boolean, text) TO authenticated;
