-- Негативные контроли для черновиков 0135..0142.
--
-- Каждый прогон ломает РОВНО ОДНУ защиту на уже применённой и уже зелёной
-- базе, после чего hardening-postflight-assertions.sql обязан покраснеть.
-- Мутация, которую проверки не заметили, означает, что соответствующий
-- ассерт не способен упасть — то есть его там фактически нет.
--
-- Вызов: psql -v mutation=<имя> -f hardening-negative-controls.sql
--
-- Чего здесь СОЗНАТЕЛЬНО нет:
--   * мутации «убрать NOT is_demo из is_admin_session()». Инвариант
--     «demo-аккаунт не администратор» держит CHECK users_demo_is_never_admin
--     из применённой 0131, поэтому создать контрпример нельзя, и ассерт на
--     это принципиально не может покраснеть. Класть в набор мутацию, которую
--     невозможно поймать, — значит заведомо провалить прогон; условие в
--     функции остаётся как дублирующая защита и помечено так в 0137.

\set ON_ERROR_STOP on

\if :{?mutation}
\else
  \echo 'ОШИБКА: не задано -v mutation=<имя>'
  \quit
\endif

\echo :'mutation'

CREATE OR REPLACE FUNCTION public.fx_mutate(p_name text)
RETURNS void
LANGUAGE plpgsql
AS $mutate$
DECLARE
  m text := p_name;
BEGIN
  ------------------------------------------------------------------ 0135 ----
  IF m = 'regrant_table_update_users' THEN
    -- Классическая ошибка: вернули табличный грант, колоночная модель мертва.
    GRANT UPDATE ON public.users TO authenticated;

  ELSIF m = 'regrant_ranking_score' THEN
    GRANT UPDATE (ranking_score) ON public.master_profiles TO authenticated;

  ELSIF m = 'regrant_users_insert' THEN
    GRANT INSERT ON public.users TO authenticated;

  ELSIF m = 'regrant_rating_columns' THEN
    GRANT UPDATE (rating_overall_avg, rating_overall_count) ON public.master_profiles TO authenticated;

  ELSIF m = 'regrant_anon_update' THEN
    GRANT UPDATE ON public.users TO anon;

  ELSIF m = 'regrant_truncate' THEN
    GRANT TRUNCATE ON public.users TO authenticated;

  ELSIF m = 'recalc_back_to_invoker' THEN
    ALTER FUNCTION public.recalc_master_rating() SECURITY INVOKER;

  ELSIF m = 'drop_needed_last_seen_feed_at' THEN
    -- Слишком узкий список: ломает mark_feed_seen() в опубликованном клиенте.
    REVOKE UPDATE (last_seen_feed_at) ON public.users FROM authenticated;

  ELSIF m = 'drop_needed_responses_count' THEN
    REVOKE UPDATE (responses_count) ON public.orders FROM authenticated;

  ELSIF m = 'drop_needed_picked_master_id' THEN
    REVOKE UPDATE (picked_master_id) ON public.orders FROM authenticated;

  ELSIF m = 'drop_needed_response_status' THEN
    REVOKE UPDATE (status) ON public.order_responses FROM authenticated;

  ELSIF m = 'drop_needed_users_status' THEN
    REVOKE UPDATE (status) ON public.users FROM authenticated;

  ELSIF m = 'drop_acl_baseline' THEN
    DROP TABLE public.api_grants_baseline_0135;

  ------------------------------------------------------------------ 0137 ----
  ELSIF m = 'admin_session_trusts_jwt_aal' THEN
    -- Уровень доверия берётся из клейма токена вместо auth.sessions.
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.is_admin_session() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
      SELECT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = auth.uid() AND u.is_admin AND NOT u.is_demo AND u.status = 'active')
         AND coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
    $f$;
    $body$;

  ELSIF m = 'admin_session_ignores_aal' THEN
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.is_admin_session() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
      SELECT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = auth.uid() AND u.is_admin AND NOT u.is_demo AND u.status = 'active');
    $f$;
    $body$;

  ELSIF m = 'admin_session_ignores_admin_flag' THEN
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.is_admin_session() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
      SELECT EXISTS (SELECT 1 FROM auth.sessions s
                      WHERE s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
                        AND s.user_id = auth.uid() AND s.aal = 'aal2');
    $f$;
    $body$;

  ELSIF m = 'admin_session_ignores_user_status' THEN
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.is_admin_session() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
      SELECT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = auth.uid() AND u.is_admin AND NOT u.is_demo)
         AND EXISTS (SELECT 1 FROM auth.sessions s
                      WHERE s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
                        AND s.user_id = auth.uid() AND s.aal = 'aal2');
    $f$;
    $body$;

  ELSIF m = 'admin_session_granted_to_anon' THEN
    GRANT EXECUTE ON FUNCTION public.is_admin_session() TO anon;

  ------------------------------------------------------------------ 0139 ----
  ELSIF m = 'journal_grant_insert_to_authenticated' THEN
    GRANT INSERT ON public.admin_actions TO authenticated;
    CREATE POLICY admin_actions_open_insert ON public.admin_actions FOR INSERT WITH CHECK (true);

  ELSIF m = 'journal_drop_row_triggers' THEN
    DROP TRIGGER admin_actions_no_update ON public.admin_actions;
    DROP TRIGGER admin_actions_no_delete ON public.admin_actions;
    GRANT UPDATE, DELETE ON public.admin_actions TO authenticated;

  ELSIF m = 'journal_drop_truncate_trigger' THEN
    DROP TRIGGER admin_actions_no_truncate ON public.admin_actions;

  ELSIF m = 'journal_rls_permits_everyone' THEN
    DROP POLICY admin_actions_admin_select ON public.admin_actions;
    CREATE POLICY admin_actions_admin_select ON public.admin_actions FOR SELECT USING (true);

  ELSIF m = 'journal_rls_disabled' THEN
    ALTER TABLE public.admin_actions DISABLE ROW LEVEL SECURITY;

  ELSIF m = 'journal_select_granted_to_anon' THEN
    GRANT SELECT ON public.admin_actions TO anon;

  ELSIF m = 'journal_rpc_skips_admin_check' THEN
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.admin_log_action(
      p_action text, p_target_type text, p_target_id uuid, p_reason text,
      p_report_id uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb,
      p_reverts_action_id uuid DEFAULT NULL)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
    DECLARE v_id uuid;
    BEGIN
      INSERT INTO public.admin_actions (admin_id, target_type, target_id, action, reason, report_id, details, reverts_action_id)
      VALUES (auth.uid(), p_target_type, p_target_id, p_action, btrim(p_reason), p_report_id,
              coalesce(p_details, '{}'::jsonb), p_reverts_action_id)
      RETURNING id INTO v_id;
      RETURN v_id;
    END $f$;
    $body$;

  ELSIF m = 'journal_reason_check_dropped' THEN
    ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_reason_check;
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.admin_log_action(
      p_action text, p_target_type text, p_target_id uuid, p_reason text,
      p_report_id uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb,
      p_reverts_action_id uuid DEFAULT NULL)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
    DECLARE v_id uuid;
    BEGIN
      IF NOT public.is_admin_session() THEN
        RAISE EXCEPTION 'нет прав' USING ERRCODE = '42501';
      END IF;
      INSERT INTO public.admin_actions (admin_id, target_type, target_id, action, reason, report_id, details, reverts_action_id)
      VALUES (auth.uid(), p_target_type, p_target_id, p_action, p_reason, p_report_id,
              coalesce(p_details, '{}'::jsonb), p_reverts_action_id)
      RETURNING id INTO v_id;
      RETURN v_id;
    END $f$;
    $body$;

  ELSIF m = 'journal_action_check_dropped' THEN
    ALTER TABLE public.admin_actions DROP CONSTRAINT admin_actions_action_check;

  ------------------------------------------------------------------ 0141 ----
  ELSIF m = 'admin_policy_back_to_is_current_user_admin' THEN
    DROP POLICY users_admin_update ON public.users;
    CREATE POLICY users_admin_update ON public.users FOR UPDATE
      USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

  ELSIF m = 'drop_admin_scope_trigger' THEN
    DROP TRIGGER users_guard_admin_scope ON public.users;

  ELSIF m = 'admin_scope_trigger_noop' THEN
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.guard_admin_user_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $f$
    BEGIN RETURN NEW; END $f$;
    $body$;

  ELSIF m = 'admin_scope_trigger_column_list_misses_phone' THEN
    -- Перечисление колонок вместо сравнения строк: одна забытая колонка —
    -- и подмена контактного телефона снова возможна.
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.guard_admin_user_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $f$
    BEGIN
      IF current_user = 'postgres' THEN RETURN NEW; END IF;
      IF NEW.id = (SELECT auth.uid()) THEN RETURN NEW; END IF;
      IF NEW.first_name IS DISTINCT FROM OLD.first_name
         OR NEW.last_name IS DISTINCT FROM OLD.last_name
         OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
        RAISE EXCEPTION 'нельзя' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END $f$;
    $body$;

  ELSIF m = 'admin_scope_trigger_skips_admin_path' THEN
    -- Проверяет только свою строку, то есть ровно наоборот.
    EXECUTE $body$
CREATE OR REPLACE FUNCTION public.guard_admin_user_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $f$
    BEGIN
      IF current_user = 'postgres' THEN RETURN NEW; END IF;
      IF NEW.id <> (SELECT auth.uid()) THEN RETURN NEW; END IF;
      RETURN NEW;
    END $f$;
    $body$;

  ------------------------------------------------------------ применённая 0130
  ELSIF m = 'disable_applied_0130_trigger' THEN
    ALTER TABLE public.users DISABLE TRIGGER users_guard_privilege_columns;

  ELSE
    RAISE EXCEPTION 'неизвестная мутация: %', m;
  END IF;
END
$mutate$;

SELECT public.fx_mutate(:'mutation');
