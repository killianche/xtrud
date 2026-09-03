-- Жалобы и санкции в админке (docs/ADMIN_PANEL.md §4, пункты 1 и 2).
--
-- Разбор жалобы состоит из двух разных действий, и путать их нельзя:
--   * решение по самой жалобе — обоснована она или нет;
--   * санкция человеку — отдельное действие с отдельной причиной.
-- Жалобу можно отклонить, не трогая человека, и наказать можно без жалобы.
--
-- Каждое действие пишет в admin_actions. Причина обязательна: запись «кто и
-- почему» без «почему» бесполезна ровно тогда, когда понадобится.
--
-- Чего здесь нет и почему:
--   * приостановки на срок — в users нет колонки «до какого числа», а
--     выдумывать схему под интерфейс нельзя. Есть три состояния: активен,
--     приостановлен, заблокирован;
--   * удаления чужого текста — скрыть отзыв можно, переписать нельзя
--     (граница из §4 контракта).

BEGIN;

-- ── Очередь жалоб с предметом жалобы ────────────────────────────────────────
-- Модератор обязан видеть, НА ЧТО жалоба, а не голый идентификатор: цель
-- намеренно не внешний ключ (0029), поэтому склеиваем текст по типу вручную.
CREATE OR REPLACE FUNCTION public.admin_list_reports(
  p_status text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id              uuid,
  created_at      timestamptz,
  status          text,
  reason          text,
  description     text,
  target_type     text,
  target_id       uuid,
  target_label    text,
  target_user_id  uuid,
  reporter_id     uuid,
  reporter_label  text,
  reports_on_target bigint,
  reports_by_reporter bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id,
         r.created_at,
         r.status::text,
         r.reason::text,
         r.description,
         r.target_type::text,
         r.target_id,
         CASE r.target_type::text
           WHEN 'user'   THEN (SELECT btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
                                 FROM public.users u WHERE u.id = r.target_id)
           WHEN 'order'  THEN (SELECT o.title FROM public.orders o WHERE o.id = r.target_id)
           WHEN 'review' THEN (SELECT left(coalesce(rv.text, ''), 160)
                                 FROM public.reviews rv WHERE rv.id = r.target_id)
           ELSE NULL
         END AS target_label,
         -- Кого наказывать: для жалобы на задание или отзыв это их автор.
         CASE r.target_type::text
           WHEN 'user'   THEN r.target_id
           WHEN 'order'  THEN (SELECT o.client_id FROM public.orders o WHERE o.id = r.target_id)
           WHEN 'review' THEN (SELECT rv.author_id FROM public.reviews rv WHERE rv.id = r.target_id)
           ELSE NULL
         END AS target_user_id,
         r.reporter_id,
         (SELECT btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
            FROM public.users u WHERE u.id = r.reporter_id) AS reporter_label,
         (SELECT count(*) FROM public.reports x WHERE x.target_id = r.target_id),
         (SELECT count(*) FROM public.reports x WHERE x.reporter_id = r.reporter_id)
    FROM public.reports r
   WHERE p_status IS NULL OR r.status::text = p_status
   ORDER BY (r.status::text = 'pending') DESC, r.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- ── Решение по жалобе ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_status    text,
  p_note      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('reviewed', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT true INTO v_exists FROM public.reports WHERE id = p_report_id;
  IF v_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'report_not_found' USING errcode = 'P0002';
  END IF;

  UPDATE public.reports
     SET status = p_status::public.report_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         admin_note = btrim(p_note),
         updated_at = now()
   WHERE id = p_report_id;

  PERFORM public.admin_log_action(
    'resolve_report', 'report', p_report_id, btrim(p_note), p_report_id,
    jsonb_build_object('status', p_status)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Санкция человеку ────────────────────────────────────────────────────────
-- Отдельное действие с отдельной причиной. Снятие санкции — тот же вызов со
-- статусом active: «снять» обязано быть таким же простым, как «наказать»,
-- иначе ошибочная блокировка живёт вечно.
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_user_id uuid,
  p_status  text,
  p_reason  text,
  p_report_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current text;
  v_is_admin boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('active', 'suspended', 'banned') THEN
    RAISE EXCEPTION 'bad_status' USING errcode = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT u.status::text, u.is_admin INTO v_current, v_is_admin
    FROM public.users u WHERE u.id = p_user_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  -- Заблокированный администратор перестаёт быть модератором (см.
  -- is_admin_session), то есть панель закрылась бы сама за собой.
  IF v_is_admin AND p_status <> 'active' THEN
    RAISE EXCEPTION 'cannot_sanction_admin' USING errcode = '42501';
  END IF;

  -- Удалённый аккаунт не воскрешаем: его данные уже обезличены.
  IF v_current = 'deleted' THEN
    RAISE EXCEPTION 'user_deleted' USING errcode = '22023';
  END IF;

  UPDATE public.users
     SET status = p_status::public.user_status,
         updated_at = now()
   WHERE id = p_user_id;

  PERFORM public.admin_log_action(
    CASE p_status
      WHEN 'suspended' THEN 'suspend'
      WHEN 'banned'    THEN 'ban'
      ELSE 'unban'
    END,
    'user', p_user_id, btrim(p_reason), p_report_id,
    jsonb_build_object('from', v_current, 'to', p_status)
  );

  RETURN jsonb_build_object('ok', true, 'from', v_current, 'to', p_status);
END;
$$;

-- ── Предупреждение ──────────────────────────────────────────────────────────
-- Ничего не меняет в правах: это отметка в журнале, чтобы вторая жалоба на
-- того же человека была видна как повторная, а не как первая.
CREATE OR REPLACE FUNCTION public.admin_warn_user(
  p_user_id uuid,
  p_reason  text,
  p_report_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT public.is_admin_session() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  SELECT true INTO v_exists FROM public.users WHERE id = p_user_id;
  IF v_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'user_not_found' USING errcode = 'P0002';
  END IF;

  PERFORM public.admin_log_action('warn', 'user', p_user_id, btrim(p_reason), p_report_id, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Права ───────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_list_reports(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_report(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_warn_user(uuid, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_reports(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_warn_user(uuid, text, uuid) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Жалобы и санкции: функции созданы, права только у authenticated.';
END
$$;

COMMIT;
