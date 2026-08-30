-- Negative controls for the two publication drafts.
--
-- A green fixture is worthless until its assertions have been proven capable of
-- going red. In the user-blocking work a fully green fixture froze a
-- HIGH-severity hole into a contract precisely because nobody made the
-- assertions fail on purpose. Each mutation below breaks the drafts in a
-- specific, plausible way — the way a tired author, a careless merge or a
-- "harmless simplification" would break them — and the runner then requires
-- scripts/supabase/limits-postflight-assertions.sql to reject it.
--
-- Usage (the runner does this):
--   psql -v mutation=<name> -f limits-negative-controls.sql
--
-- A mutation the assertions do NOT catch is a hole in the test suite and fails
-- the whole run.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.fx_apply_mutation(p_name text)
RETURNS void
LANGUAGE plpgsql
AS $mutation$
BEGIN
  CASE p_name

  -- ==== gap Р4 ============================================================

  -- 1. The trigger is gone. Models a later migration that recreates the table
  --    or drops the trigger while cleaning up.
  WHEN 'drop_publication_limit_trigger' THEN
    DROP TRIGGER orders_publication_limit_guard ON public.orders;

  -- 2. INSERT guarded, UPDATE forgotten. The exact bypass class proven on a real
  --    database in the blocking work: reopen_order walks straight through.
  WHEN 'limit_guard_ignores_updates' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL OR TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        IF NEW.status = 'open' THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND status = 'open' AND id IS DISTINCT FROM NEW.id;
          IF v_count >= 3 THEN
            RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
              USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
          END IF;
        END IF;
        SELECT count(*) INTO v_count FROM public.orders
        WHERE client_id = NEW.client_id AND created_at > now() - interval '24 hours';
        IF v_count >= 5 THEN
          RAISE EXCEPTION 'За последние сутки вы опубликовали 5 заданий.'
            USING ERRCODE = '42501', DETAIL = 'daily_order_limit_reached';
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 3. A "harmless" off-by-one: > instead of >=. Four open tasks, not three.
  WHEN 'limit_guard_open_cap_off_by_one' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_entering_open boolean;
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        v_entering_open := (TG_OP = 'INSERT' AND NEW.status = 'open')
          OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');
        IF TG_OP = 'UPDATE' AND NOT v_entering_open THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        IF v_entering_open THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND status = 'open' AND id IS DISTINCT FROM NEW.id;
          IF v_count > 3 THEN
            RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
              USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
          END IF;
        END IF;
        IF TG_OP = 'INSERT' THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND created_at > now() - interval '24 hours';
          IF v_count >= 5 THEN
            RAISE EXCEPTION 'За последние сутки вы опубликовали 5 заданий.'
              USING ERRCODE = '42501', DETAIL = 'daily_order_limit_reached';
          END IF;
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 4. The reopen path explicitly exempted, as "it is not a new task anyway".
  WHEN 'limit_guard_exempts_reopen' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_entering_open boolean;
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND OLD.status IN ('cancelled', 'expired') THEN RETURN NEW; END IF;
        v_entering_open := (TG_OP = 'INSERT' AND NEW.status = 'open')
          OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');
        IF TG_OP = 'UPDATE' AND NOT v_entering_open THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        IF v_entering_open THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND status = 'open' AND id IS DISTINCT FROM NEW.id;
          IF v_count >= 3 THEN
            RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
              USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
          END IF;
        END IF;
        IF TG_OP = 'INSERT' THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND created_at > now() - interval '24 hours';
          IF v_count >= 5 THEN
            RAISE EXCEPTION 'За последние сутки вы опубликовали 5 заданий.'
              USING ERRCODE = '42501', DETAIL = 'daily_order_limit_reached';
          END IF;
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 5. The rate cap dropped, leaving only the concurrency cap: three open tasks
  --    cancelled and republished all evening, every republication a fan-out.
  WHEN 'limit_guard_no_rate_cap' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_entering_open boolean;
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        v_entering_open := (TG_OP = 'INSERT' AND NEW.status = 'open')
          OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');
        IF NOT v_entering_open THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        SELECT count(*) INTO v_count FROM public.orders
        WHERE client_id = NEW.client_id AND status = 'open' AND id IS DISTINCT FROM NEW.id;
        IF v_count >= 3 THEN
          RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
            USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 6. The rate cap narrowed to open tasks only. Cancel as you go and it never
  --    fires — the plausible mistake, because "active" reads like "open".
  WHEN 'limit_guard_rate_cap_counts_open_only' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_entering_open boolean;
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        v_entering_open := (TG_OP = 'INSERT' AND NEW.status = 'open')
          OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');
        IF TG_OP = 'UPDATE' AND NOT v_entering_open THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        IF v_entering_open THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND status = 'open' AND id IS DISTINCT FROM NEW.id;
          IF v_count >= 3 THEN
            RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
              USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
          END IF;
        END IF;
        IF TG_OP = 'INSERT' THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND status = 'open'
            AND created_at > now() - interval '24 hours';
          IF v_count >= 5 THEN
            RAISE EXCEPTION 'За последние сутки вы опубликовали 5 заданий.'
              USING ERRCODE = '42501', DETAIL = 'daily_order_limit_reached';
          END IF;
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 7. A cap that became a cage. The row being written is no longer excluded
  --    from its own count, so a client sitting at exactly three open tasks can
  --    no longer close one: the close counts the task it is closing.
  WHEN 'limit_guard_blocks_closing' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        SELECT count(*) INTO v_count FROM public.orders
        WHERE client_id = NEW.client_id AND status = 'open';
        IF v_count >= 3 THEN
          RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
            USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 8. The no-JWT exemption removed "to be strict". Cron, service_role and a
  --    restore of the production dump all start failing.
  WHEN 'limit_guard_blocks_server_paths' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_entering_open boolean;
        v_count bigint;
      BEGIN
        v_entering_open := (TG_OP = 'INSERT' AND NEW.status = 'open')
          OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');
        IF TG_OP = 'UPDATE' AND NOT v_entering_open THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        IF v_entering_open THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND status = 'open' AND id IS DISTINCT FROM NEW.id;
          IF v_count >= 3 THEN
            RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
              USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
          END IF;
        END IF;
        IF TG_OP = 'INSERT' THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND created_at > now() - interval '24 hours';
          IF v_count >= 5 THEN
            RAISE EXCEPTION 'За последние сутки вы опубликовали 5 заданий.'
              USING ERRCODE = '42501', DETAIL = 'daily_order_limit_reached';
          END IF;
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 9. The advisory lock dropped as "an unnecessary cost". The counts become
  --    racy again — exactly the hole use-order-publish-capacity.ts admits to.
  WHEN 'limit_guard_drops_advisory_lock' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_entering_open boolean;
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        v_entering_open := (TG_OP = 'INSERT' AND NEW.status = 'open')
          OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');
        IF TG_OP = 'UPDATE' AND NOT v_entering_open THEN RETURN NEW; END IF;
        IF v_entering_open THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND status = 'open' AND id IS DISTINCT FROM NEW.id;
          IF v_count >= 3 THEN
            RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
              USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
          END IF;
        END IF;
        IF TG_OP = 'INSERT' THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE client_id = NEW.client_id AND created_at > now() - interval '24 hours';
          IF v_count >= 5 THEN
            RAISE EXCEPTION 'За последние сутки вы опубликовали 5 заданий.'
              USING ERRCODE = '42501', DETAIL = 'daily_order_limit_reached';
          END IF;
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 10. The per-client predicate lost: the cap becomes platform-wide, so the
  --     fourth client of the day cannot publish at all.
  WHEN 'limit_guard_counts_every_client' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_publication_limit()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_entering_open boolean;
        v_count bigint;
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        v_entering_open := (TG_OP = 'INSERT' AND NEW.status = 'open')
          OR (TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open');
        IF TG_OP = 'UPDATE' AND NOT v_entering_open THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.client_id::text, 0));
        IF v_entering_open THEN
          SELECT count(*) INTO v_count FROM public.orders
          WHERE status = 'open' AND id IS DISTINCT FROM NEW.id;
          IF v_count >= 3 THEN
            RAISE EXCEPTION 'У вас уже 3 открытых заданий.'
              USING ERRCODE = '42501', DETAIL = 'active_order_limit_reached';
          END IF;
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 11. EXECUTE handed back to the API roles, so the guard is callable directly.
  WHEN 'grant_limit_guard_to_api_roles' THEN
    GRANT EXECUTE ON FUNCTION public.guard_order_publication_limit() TO anon, authenticated;

  -- ==== gap Р1 ============================================================

  -- 12. The trigger is gone.
  WHEN 'drop_picked_master_trigger' THEN
    DROP TRIGGER orders_picked_master_guard ON public.orders;

  -- 13. The responder requirement dropped — the anchor means nothing again, and
  --     the live SECURITY DEFINER RPC can stamp anybody.
  WHEN 'picked_guard_skips_responder_check' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_picked_master()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.picked_master_id IS NOT NULL THEN
            RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.picked_master_id IS NOT DISTINCT FROM OLD.picked_master_id THEN RETURN NEW; END IF;
        IF NEW.picked_master_id IS NULL THEN
          IF NEW.status <> 'open' THEN
            RAISE EXCEPTION 'Нельзя убрать исполнителя.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
          END IF;
          NEW.picked_at := NULL;
          RETURN NEW;
        END IF;
        IF OLD.picked_master_id IS NOT NULL THEN
          RAISE EXCEPTION 'Исполнителя уже нельзя изменить.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
        END IF;
        IF NEW.status <> 'cancelled' THEN
          RAISE EXCEPTION 'Только при закрытии.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_closed_order';
        END IF;
        IF NEW.cancel_reason IS DISTINCT FROM 'found_master' THEN
          RAISE EXCEPTION 'Только «нашёл исполнителя».'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_found_master';
        END IF;
        NEW.picked_at := now();
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 14. The anchor becomes re-writable: "let the client fix a mistake".
  WHEN 'picked_guard_allows_reassignment' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_picked_master()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.picked_master_id IS NOT NULL THEN
            RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.picked_master_id IS NOT DISTINCT FROM OLD.picked_master_id THEN RETURN NEW; END IF;
        IF NEW.picked_master_id IS NULL THEN NEW.picked_at := NULL; RETURN NEW; END IF;
        IF NEW.status <> 'cancelled' THEN
          RAISE EXCEPTION 'Только при закрытии.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_closed_order';
        END IF;
        IF NEW.cancel_reason IS DISTINCT FROM 'found_master' THEN
          RAISE EXCEPTION 'Только «нашёл исполнителя».'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_found_master';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.order_responses
                       WHERE order_id = NEW.id AND master_id = NEW.picked_master_id) THEN
          RAISE EXCEPTION 'Только откликнувшийся.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_must_have_responded';
        END IF;
        NEW.picked_at := now();
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 15. The reason requirement dropped, so "больше не нужно" can also carry an
  --     executor and the funnel number stops meaning success.
  WHEN 'picked_guard_ignores_cancel_reason' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_picked_master()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.picked_master_id IS NOT NULL THEN
            RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.picked_master_id IS NOT DISTINCT FROM OLD.picked_master_id THEN RETURN NEW; END IF;
        IF NEW.picked_master_id IS NULL THEN
          IF NEW.status <> 'open' THEN
            RAISE EXCEPTION 'Нельзя убрать исполнителя.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
          END IF;
          NEW.picked_at := NULL;
          RETURN NEW;
        END IF;
        IF OLD.picked_master_id IS NOT NULL THEN
          RAISE EXCEPTION 'Исполнителя уже нельзя изменить.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
        END IF;
        IF NEW.status <> 'cancelled' THEN
          RAISE EXCEPTION 'Только при закрытии.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_closed_order';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.order_responses
                       WHERE order_id = NEW.id AND master_id = NEW.picked_master_id) THEN
          RAISE EXCEPTION 'Только откликнувшийся.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_must_have_responded';
        END IF;
        NEW.picked_at := now();
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 16. Immutability taken too far: reopen_order can no longer clear the anchor,
  --     so the published client's "Открыть заново" button breaks.
  WHEN 'picked_guard_blocks_reopen' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_picked_master()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.picked_master_id IS NOT NULL THEN
            RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.picked_master_id IS NOT DISTINCT FROM OLD.picked_master_id THEN RETURN NEW; END IF;
        IF OLD.picked_master_id IS NOT NULL THEN
          RAISE EXCEPTION 'Исполнителя уже нельзя изменить.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
        END IF;
        IF NEW.status <> 'cancelled' THEN
          RAISE EXCEPTION 'Только при закрытии.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_closed_order';
        END IF;
        IF NEW.cancel_reason IS DISTINCT FROM 'found_master' THEN
          RAISE EXCEPTION 'Только «нашёл исполнителя».'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_found_master';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.order_responses
                       WHERE order_id = NEW.id AND master_id = NEW.picked_master_id) THEN
          RAISE EXCEPTION 'Только откликнувшийся.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_must_have_responded';
        END IF;
        NEW.picked_at := now();
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 17. The resting state validated instead of the transition. Every legacy row
  --     with an unverifiable picked master becomes unwritable forever.
  WHEN 'picked_guard_validates_resting_state' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_picked_master()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' AND NEW.picked_master_id IS NOT NULL THEN
          RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
        END IF;
        IF NEW.picked_master_id IS NOT NULL THEN
          IF NEW.cancel_reason IS DISTINCT FROM 'found_master' THEN
            RAISE EXCEPTION 'Только «нашёл исполнителя».'
              USING ERRCODE = '42501', DETAIL = 'picked_master_requires_found_master';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM public.order_responses
                         WHERE order_id = NEW.id AND master_id = NEW.picked_master_id) THEN
            RAISE EXCEPTION 'Только откликнувшийся.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_must_have_responded';
          END IF;
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 18. picked_at left to the caller. The timestamp stops being evidence.
  WHEN 'picked_guard_does_not_stamp_picked_at' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_picked_master()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.picked_master_id IS NOT NULL THEN
            RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.picked_master_id IS NOT DISTINCT FROM OLD.picked_master_id THEN RETURN NEW; END IF;
        IF NEW.picked_master_id IS NULL THEN
          IF NEW.status <> 'open' THEN
            RAISE EXCEPTION 'Нельзя убрать исполнителя.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
          END IF;
          RETURN NEW;
        END IF;
        IF OLD.picked_master_id IS NOT NULL THEN
          RAISE EXCEPTION 'Исполнителя уже нельзя изменить.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
        END IF;
        IF NEW.status <> 'cancelled' THEN
          RAISE EXCEPTION 'Только при закрытии.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_closed_order';
        END IF;
        IF NEW.cancel_reason IS DISTINCT FROM 'found_master' THEN
          RAISE EXCEPTION 'Только «нашёл исполнителя».'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_found_master';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.order_responses
                       WHERE order_id = NEW.id AND master_id = NEW.picked_master_id) THEN
          RAISE EXCEPTION 'Только откликнувшийся.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_must_have_responded';
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 19. Naming an executor made mandatory, on top of an otherwise correct
  --     guard. Every earlier assertion still passes, so only the compatibility
  --     assertion can catch it — which is the point: the published client never
  --     sends picked_master_id and must keep being able to close a task as
  --     "нашёл исполнителя".
  WHEN 'picked_guard_requires_a_master' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_picked_master()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.picked_master_id IS NOT NULL THEN
            RAISE EXCEPTION 'Исполнителя можно указать только при закрытии задания.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_set_on_create';
          END IF;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status <> 'cancelled' AND NEW.status = 'cancelled'
           AND NEW.cancel_reason = 'found_master'
           AND NEW.picked_master_id IS NULL AND OLD.picked_master_id IS NULL THEN
          RAISE EXCEPTION 'Укажите исполнителя.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_required';
        END IF;
        IF NEW.picked_master_id IS NOT DISTINCT FROM OLD.picked_master_id THEN RETURN NEW; END IF;
        IF NEW.picked_master_id IS NULL THEN
          IF NEW.status <> 'open' THEN
            RAISE EXCEPTION 'Нельзя убрать исполнителя.'
              USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
          END IF;
          NEW.picked_at := NULL;
          RETURN NEW;
        END IF;
        IF OLD.picked_master_id IS NOT NULL THEN
          RAISE EXCEPTION 'Исполнителя уже нельзя изменить.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_is_final';
        END IF;
        IF NEW.status <> 'cancelled' THEN
          RAISE EXCEPTION 'Только при закрытии.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_closed_order';
        END IF;
        IF NEW.cancel_reason IS DISTINCT FROM 'found_master' THEN
          RAISE EXCEPTION 'Только «нашёл исполнителя».'
            USING ERRCODE = '42501', DETAIL = 'picked_master_requires_found_master';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.order_responses
                       WHERE order_id = NEW.id AND master_id = NEW.picked_master_id) THEN
          RAISE EXCEPTION 'Только откликнувшийся.'
            USING ERRCODE = '42501', DETAIL = 'picked_master_must_have_responded';
        END IF;
        NEW.picked_at := now();
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 20. The notification function left as it was: the chosen master receives the
  --     duplicate "Клиент отменил заказ" the anchor was supposed to end.
  WHEN 'notify_keeps_duplicate_push' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.trg_notify_order_cancelled_or_expired()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $f$
      DECLARE
        v_title text;
        v_resp record;
      BEGIN
        IF NEW.status NOT IN ('cancelled', 'expired')
           OR COALESCE(OLD.status::text, '') = NEW.status::text THEN
          RETURN NEW;
        END IF;
        v_title := CASE WHEN NEW.status = 'cancelled' THEN 'Клиент отменил заказ'
                        WHEN NEW.status = 'expired'   THEN 'Заказ истёк' END;
        IF NEW.picked_master_id IS NOT NULL AND NEW.status = 'cancelled' THEN
          PERFORM public.notify_user(NEW.picked_master_id, v_title,
            LEFT(COALESCE(NEW.title, ''), 120),
            jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id));
        END IF;
        FOR v_resp IN SELECT id, master_id FROM public.order_responses
          WHERE order_id = NEW.id AND status IN ('sent', 'viewed')
        LOOP
          PERFORM public.notify_user(v_resp.master_id, v_title,
            LEFT(COALESCE(NEW.title, ''), 120),
            jsonb_build_object('type', 'order_' || NEW.status, 'order_id', NEW.id));
        END LOOP;
        UPDATE public.order_responses SET status = 'withdrawn', updated_at = now()
          WHERE order_id = NEW.id AND status IN ('sent', 'viewed');
        RETURN NEW;
      END;
      $f$;
    $body$;

  -- 21. EXECUTE handed back to the API roles on the second guard.
  WHEN 'grant_picked_guard_to_api_roles' THEN
    GRANT EXECUTE ON FUNCTION public.guard_order_picked_master() TO anon, authenticated;

  -- 22. A policy quietly added on the way past. Neither draft owns RLS on
  --     public.orders, and a widened read surface must not slip through.
  WHEN 'sneak_in_an_orders_policy' THEN
    CREATE POLICY orders_read_everything ON public.orders FOR SELECT USING (true);

  ELSE
    RAISE EXCEPTION 'unknown mutation: %', p_name;
  END CASE;
END
$mutation$;

SELECT public.fx_apply_mutation(:'mutation');

\echo 'MUTATION APPLIED — the postflight assertions must now FAIL'
