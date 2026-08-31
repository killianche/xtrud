-- Проверки эквивалентности отката для 0142 / 0140 / 0138 / 0136.
--
-- Откат считается выполненным, только если база вернулась в то состояние, в
-- котором была ДО черновиков, а не в «похожее». Поэтому проверяется и то, что
-- новые объекты исчезли, и то, что старые вернулись, и то, что применённая
-- 0130 всё это пережила.

\set ON_ERROR_STOP on

DO $revert_assert$
DECLARE
  v_tbl text;
  v_qual text;
  v_bad text;
BEGIN
  -- R01 объекты черновиков удалены
  IF to_regproc('public.is_admin_session') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [R01 is_admin_session() пережила откат]' USING ERRCODE='XTA01';
  END IF;
  IF to_regclass('public.admin_actions') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [R02 admin_actions пережила откат]' USING ERRCODE='XTA01';
  END IF;
  IF to_regproc('public.admin_log_action') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [R03 admin_log_action() пережила откат]' USING ERRCODE='XTA01';
  END IF;
  IF to_regproc('public.guard_admin_user_scope') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [R04 guard_admin_user_scope() пережила откат]' USING ERRCODE='XTA01';
  END IF;
  IF to_regclass('public.api_grants_baseline_0135') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [R05 снимок ACL не удалён]' USING ERRCODE='XTA01';
  END IF;

  -- R06 политика вернулась к тексту применённой 0030
  SELECT coalesce(qual, '') INTO v_qual FROM pg_policies
   WHERE schemaname='public' AND tablename='users' AND policyname='users_admin_update';
  IF v_qual NOT LIKE '%is_current_user_admin%' THEN
    RAISE EXCEPTION 'ASSERT FAIL [R06 users_admin_update не восстановлена]: %', v_qual USING ERRCODE='XTA01';
  END IF;

  -- R07 широкие гранты вернулись: откат обязан вернуть ИМЕННО то, что было,
  --     включая привилегии, которых наивный «GRANT ALL» мог бы не дать.
  FOREACH v_tbl IN ARRAY ARRAY['users','master_profiles','orders','order_responses'] LOOP
    IF NOT has_table_privilege('authenticated', ('public.'||v_tbl)::regclass, 'UPDATE')
       OR NOT has_table_privilege('authenticated', ('public.'||v_tbl)::regclass, 'INSERT')
       OR NOT has_table_privilege('anon', ('public.'||v_tbl)::regclass, 'UPDATE') THEN
      RAISE EXCEPTION 'ASSERT FAIL [R07 табличные гранты на public.% не восстановлены]', v_tbl USING ERRCODE='XTA01';
    END IF;
  END LOOP;

  -- R08 ranking_score снова писабелен: откат — это возврат к прежнему,
  --     в том числе к прежней дыре. Если это не так, значит откат частичный.
  IF NOT has_column_privilege('authenticated','public.master_profiles','ranking_score','UPDATE') THEN
    RAISE EXCEPTION 'ASSERT FAIL [R08 откат не вернул UPDATE на ranking_score]' USING ERRCODE='XTA01';
  END IF;

  -- R09 recalc_master_rating() снова SECURITY INVOKER
  IF (SELECT prosecdef FROM pg_proc
       WHERE pronamespace='public'::regnamespace AND proname='recalc_master_rating' AND pronargs=0) THEN
    RAISE EXCEPTION 'ASSERT FAIL [R09 recalc_master_rating() осталась SECURITY DEFINER]' USING ERRCODE='XTA01';
  END IF;

  -- R10 применённая 0130 пережила и применение, и откат
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid='public.users'::regclass
                    AND t.tgname='users_guard_privilege_columns'
                    AND NOT t.tgisinternal AND t.tgenabled <> 'D') THEN
    RAISE EXCEPTION 'ASSERT FAIL [R10 откат повредил применённую 0130]' USING ERRCODE='XTA01';
  END IF;

  -- R11 политики, не принадлежащие черновикам, на месте
  SELECT string_agg(p, ', ' ORDER BY p) INTO v_bad FROM unnest(ARRAY[
    'users_select_all','users_insert_own','users_update_own',
    'master_profiles_read_all','master_profiles_insert_own','master_profiles_update_own',
    'orders_read_open_or_own','orders_insert_own','orders_owner_edit_open'
  ]) p
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname = p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [R11 откат снёс чужие политики: %]', v_bad USING ERRCODE='XTA01';
  END IF;

  RAISE NOTICE 'REVERT: база вернулась в состояние до черновиков, 0130 не повреждена.';
END
$revert_assert$;
