-- Negative controls for the moderation drafts.
--
-- A green fixture is worthless until its assertions have been proven capable of
-- going red. In the user-blocking work a fully green fixture froze a
-- HIGH-severity hole into a contract precisely because nobody made the
-- assertions fail on purpose. Each mutation below breaks the drafts in a
-- specific, plausible way; the runner then requires
-- scripts/supabase/moderation-postflight-assertions.sql to reject it.
--
-- Usage (the runner does this):
--   psql -v mutation=<name> -f moderation-negative-controls.sql
--
-- A mutation that the assertions do NOT catch is a hole in the test suite and
-- fails the whole run.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.fx_apply_mutation(p_name text)
RETURNS void
LANGUAGE plpgsql
AS $mutation$
BEGIN
  CASE p_name

  -- 1. The most obvious regression: a guard whose trigger is gone. Models a
  --    later migration that recreates public.orders or drops the trigger.
  WHEN 'drop_orders_content_trigger' THEN
    DROP TRIGGER orders_author_active_guard ON public.orders;

  -- 2. The status lock removed: the suspended user lifts their own suspension.
  WHEN 'drop_users_privilege_trigger' THEN
    DROP TRIGGER users_privilege_columns_guard ON public.users;

  -- 3. INSERT blocked, UPDATE forgotten. This is the bypass class the blocking
  --    work proved on a real database, applied to suspension: the same text is
  --    rewritten in place instead of being posted again.
  WHEN 'content_guard_ignores_updates' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_content_author_active()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_actor uuid := auth.uid();
        v_status public.user_status;
      BEGIN
        IF v_actor IS NULL OR TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
        SELECT status INTO v_status FROM public.users WHERE id = v_actor;
        IF v_status IS NULL OR v_status = 'active' THEN RETURN NEW; END IF;
        RAISE EXCEPTION 'Аккаунт ограничен.'
          USING ERRCODE = '42501', DETAIL = 'account_not_active';
      END
      $f$;
    $body$;

  -- 4. The predicate narrowed to 'banned' only. Suspension — the sanction the
  --    admin UI actually applies — stops meaning anything again.
  WHEN 'content_guard_only_banned' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_content_author_active()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_actor uuid := auth.uid();
        v_status public.user_status;
        v_column text;
      BEGIN
        IF v_actor IS NULL THEN RETURN NEW; END IF;
        SELECT status INTO v_status FROM public.users WHERE id = v_actor;
        IF v_status IS DISTINCT FROM 'banned' THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          RAISE EXCEPTION 'Аккаунт ограничен.'
            USING ERRCODE = '42501', DETAIL = 'account_not_active';
        END IF;
        FOREACH v_column IN ARRAY TG_ARGV LOOP
          IF (to_jsonb(NEW) -> v_column) IS DISTINCT FROM (to_jsonb(OLD) -> v_column) THEN
            RAISE EXCEPTION 'Аккаунт ограничен.'
              USING ERRCODE = '42501', DETAIL = 'account_not_active';
          END IF;
        END LOOP;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 5. THE ORACLE CONTROL. The guard steps aside for anything that is not a
  --    PostgREST role — which is exactly what a SECURITY DEFINER RPC looks like
  --    from inside. This is the shape an author would reach for by copying the
  --    users guard, and it silently reopens the freeform-review path that has
  --    no migration file and no RLS.
  WHEN 'content_guard_skips_definer_rpc' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_content_author_active()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_actor uuid := auth.uid();
        v_status public.user_status;
        v_column text;
      BEGIN
        IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
        IF v_actor IS NULL THEN RETURN NEW; END IF;
        SELECT status INTO v_status FROM public.users WHERE id = v_actor;
        IF v_status IS NULL OR v_status = 'active' THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          RAISE EXCEPTION 'Аккаунт ограничен.'
            USING ERRCODE = '42501', DETAIL = 'account_not_active';
        END IF;
        FOREACH v_column IN ARRAY TG_ARGV LOOP
          IF (to_jsonb(NEW) -> v_column) IS DISTINCT FROM (to_jsonb(OLD) -> v_column) THEN
            RAISE EXCEPTION 'Аккаунт ограничен.'
              USING ERRCODE = '42501', DETAIL = 'account_not_active';
          END IF;
        END LOOP;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 6. Hiding stops hiding.
  WHEN 'drop_hidden_select_policies' THEN
    DROP POLICY orders_moderation_hidden_anon_restrictive ON public.orders;
    DROP POLICY orders_moderation_hidden_auth_restrictive ON public.orders;

  -- 7. RESTRICTIVE downgraded to PERMISSIVE with an identical expression. A
  --    PERMISSIVE policy is OR-ed with the others, so it widens instead of
  --    narrowing and the hidden task stays visible. Easy to get wrong, and
  --    invisible in a diff that only reads the USING clause.
  WHEN 'hidden_policies_become_permissive' THEN
    DROP POLICY orders_moderation_hidden_anon_restrictive ON public.orders;
    DROP POLICY orders_moderation_hidden_auth_restrictive ON public.orders;
    CREATE POLICY orders_moderation_hidden_anon_restrictive ON public.orders
      FOR SELECT TO anon USING (orders.moderation_hidden_at IS NULL);
    CREATE POLICY orders_moderation_hidden_auth_restrictive ON public.orders
      FOR SELECT TO authenticated
      USING (orders.moderation_hidden_at IS NULL
             OR orders.client_id = (SELECT auth.uid())
             OR (SELECT public.is_current_user_admin()));

  -- 8. The moderation mark becomes client-writable, so the owner unhides itself.
  WHEN 'drop_moderation_column_guard' THEN
    DROP TRIGGER orders_moderation_columns_guard ON public.orders;

  -- 9. The response guard loses its RLS bypass and therefore fails OPEN: under
  --    the caller's own row level security the hidden order is invisible, EXISTS
  --    is false, and the response it exists to reject is accepted.
  WHEN 'response_guard_becomes_invoker' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_response_target_not_hidden()
      RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
      SET search_path = public, pg_temp
      AS $f$
      BEGIN
        IF auth.uid() IS NULL THEN RETURN NEW; END IF;
        IF EXISTS (SELECT 1 FROM public.orders
                    WHERE id = NEW.order_id AND moderation_hidden_at IS NOT NULL) THEN
          RAISE EXCEPTION 'Задание скрыто модератором.'
            USING ERRCODE = '42501', DETAIL = 'order_moderation_hidden';
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 10. The RPC trusts whoever calls it. Reachable at
  --     /rest/v1/rpc/admin_set_order_hidden by any signed-in user.
  WHEN 'rpc_skips_admin_check' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.admin_set_order_hidden(p_order_id uuid, p_hidden boolean)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE v_actor uuid := auth.uid();
      BEGIN
        IF v_actor IS NULL THEN
          RAISE EXCEPTION 'Требуется вход в аккаунт.'
            USING ERRCODE = '42501', DETAIL = 'not_authenticated';
        END IF;
        UPDATE public.orders
        SET moderation_hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END,
            moderation_hidden_by = CASE WHEN p_hidden THEN v_actor ELSE NULL END
        WHERE id = p_order_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Задание не найдено.'
            USING ERRCODE = 'P0002', DETAIL = 'order_not_found';
        END IF;
      END
      $f$;
    $body$;

  -- 11. The moderator loses sight of the subject of the report — the client
  --     half of gap Р5 becomes unimplementable and nobody notices.
  WHEN 'drop_admin_select_policy' THEN
    DROP POLICY orders_admin_select ON public.orders;

  -- 12. The moderator RPC becomes reachable by anonymous callers.
  WHEN 'grant_rpc_to_anon' THEN
    GRANT EXECUTE ON FUNCTION public.admin_set_order_hidden(uuid, boolean) TO anon;

  -- -------------------------------------------------------------------------
  -- Structure-preserving mutations. Everything the structural section of the
  -- postflight inspects — trigger present and enabled, security mode, ACL,
  -- policy name / kind / command — is left exactly as the drafts leave it, so
  -- ONLY a behavioural assertion can catch these. They are what proves the
  -- behavioural half of the suite is load-bearing rather than decorative.
  -- -------------------------------------------------------------------------

  -- 13. The guard quietly exempts public.reviews. Structure is untouched: the
  --     trigger is still there and still SECURITY DEFINER with row_security off.
  --     Only the freeform-review oracle — the SECURITY DEFINER RPC with no
  --     migration file and no RLS — can notice.
  WHEN 'content_guard_exempts_reviews' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_content_author_active()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$
      DECLARE
        v_actor uuid := auth.uid();
        v_status public.user_status;
        v_column text;
      BEGIN
        IF TG_TABLE_NAME = 'reviews' THEN RETURN NEW; END IF;
        IF v_actor IS NULL THEN RETURN NEW; END IF;
        SELECT status INTO v_status FROM public.users WHERE id = v_actor;
        IF v_status IS NULL OR v_status = 'active' THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          RAISE EXCEPTION 'Аккаунт ограничен.'
            USING ERRCODE = '42501', DETAIL = 'account_not_active';
        END IF;
        FOREACH v_column IN ARRAY TG_ARGV LOOP
          IF (to_jsonb(NEW) -> v_column) IS DISTINCT FROM (to_jsonb(OLD) -> v_column) THEN
            RAISE EXCEPTION 'Аккаунт ограничен.'
              USING ERRCODE = '42501', DETAIL = 'account_not_active';
          END IF;
        END LOOP;
        RETURN NEW;
      END
      $f$;
    $body$;

  -- 14. The orders trigger is recreated without its column list. It is present,
  --     enabled and calls the correct function, so nothing structural changes —
  --     but TG_ARGV is empty, the loop has nothing to compare, and every text
  --     and photo edit by a suspended author goes through.
  WHEN 'content_guard_forgets_orders_columns' THEN
    DROP TRIGGER orders_author_active_guard ON public.orders;
    CREATE TRIGGER orders_author_active_guard
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_content_author_active();

  -- 15. Both RESTRICTIVE SELECT policies keep their names, kind and command and
  --     stop filtering anything.
  WHEN 'hidden_policies_allow_everyone' THEN
    DROP POLICY orders_moderation_hidden_anon_restrictive ON public.orders;
    DROP POLICY orders_moderation_hidden_auth_restrictive ON public.orders;
    CREATE POLICY orders_moderation_hidden_anon_restrictive ON public.orders
      AS RESTRICTIVE FOR SELECT TO anon USING (true);
    CREATE POLICY orders_moderation_hidden_auth_restrictive ON public.orders
      AS RESTRICTIVE FOR SELECT TO authenticated USING (true);

  -- 16. The moderation mark becomes writable by its owner while the trigger and
  --     its security mode stay exactly as declared.
  WHEN 'moderation_column_guard_noop' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_order_moderation_columns()
      RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
      SET search_path = public, pg_temp
      AS $f$ BEGIN RETURN NEW; END $f$;
    $body$;

  -- 17. A hidden task accepts new responses again, with the SECURITY DEFINER
  --     and row_security = off declarations still in place.
  WHEN 'response_guard_noop' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_response_target_not_hidden()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public, pg_temp SET row_security = off
      AS $f$ BEGIN RETURN NEW; END $f$;
    $body$;

  -- 18. The moderator read policy survives by name, kind and command but is
  --     narrowed to open tasks, so the subject of a report about a closed or
  --     already hidden task is a bare uuid again — gap Р5, reopened silently.
  WHEN 'admin_select_only_open' THEN
    DROP POLICY orders_admin_select ON public.orders;
    CREATE POLICY orders_admin_select ON public.orders
      FOR SELECT TO authenticated
      USING ((SELECT public.is_current_user_admin()) AND orders.status = 'open');

  -- 19. The users guard keeps is_admin locked and forgets status, which is the
  --     half that lets a suspended account lift its own suspension.
  WHEN 'users_guard_forgets_status' THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_user_privilege_columns()
      RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
      SET search_path = public, pg_temp
      AS $f$
      BEGIN
        IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
        IF TG_OP = 'INSERT' THEN
          NEW.is_admin := false;
          NEW.status := 'active';
          RETURN NEW;
        END IF;
        IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
          RAISE EXCEPTION 'Права модератора выдаются только на сервере.'
            USING ERRCODE = '42501', DETAIL = 'is_admin_is_server_managed';
        END IF;
        RETURN NEW;
      END
      $f$;
    $body$;

  ELSE
    RAISE EXCEPTION 'unknown mutation: %', p_name;
  END CASE;
END
$mutation$;

SELECT public.fx_apply_mutation(:'mutation');

\echo 'MUTATION APPLIED — the postflight assertions must now FAIL'
