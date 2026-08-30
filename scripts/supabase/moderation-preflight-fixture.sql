-- Isolated local fixture modelling the CURRENT, published backend as it can be
-- read from the Git migration chain plus the live-derived types in
-- src/types/database.ts. It is NOT a production schema backup and proves
-- nothing about live divergence.
--
-- It is the shared "before" state for two drafts:
--   supabase/migration-drafts/0126_suspension_enforcement.sql  (gap Р3)
--   supabase/migration-drafts/0128_order_moderation.sql        (gap Р5)
--
-- What is reproduced deliberately, because the drafts depend on it:
--
--  * THE APPLIED MIGRATION 0130. supabase/migrations/0130_guard_user_privilege_columns.sql
--    is in production: public.guard_user_privilege_columns() plus the trigger
--    users_guard_privilege_columns, locking users.is_admin and users.is_demo.
--    Its shape here is copied from the applied file and reconciled against a
--    read-only inspection of production on 2026-08-30 (owner postgres,
--    SECURITY INVOKER, proacl {postgres=X/postgres}, BEFORE UPDATE, enabled).
--    Building the fixture WITHOUT it would prove compatibility with a world
--    that no longer exists — the exact mistake this fixture caught last time.
--    Set -v p0130=skip to model the pre-0130 world, or -v p0130=foreign to model
--    an unrelated object squatting on the name; the runner uses both to prove
--    that 0126 and 0128 refuse to run.
--  * Supabase-style broad default privileges and table grants for the API
--    roles. This is why users.status is still self-writable even after 0130:
--    users_update_own restricts the ROW, the grant does not restrict the COLUMN
--    (docs/ADMIN_PANEL.md §2, PROJECT_OPERATIONS.md §8). Verified live: anon,
--    authenticated and service_role all hold UPDATE on users.status.
--  * public.is_current_user_admin() SECURITY DEFINER, granted to authenticated
--    and REVOKED from anon, exactly as 0030_admin_flag_and_policies.sql leaves
--    it. The anon revoke is load-bearing: it is why 0128 needs two RESTRICTIVE
--    policies instead of one.
--  * The PERMISSIVE policy baseline from 0009 / 0012 / 0076 / 0091 / 0092 /
--    0099 / 0029 / 0030. The drafts must not touch any of it.
--  * public.submit_master_review_fixture — the shape of the live RPC
--    submit_master_review, which has NO migration file in supabase/migrations/
--    (see src/types/database.ts:1755 and src/features/reviews/use-reviews.ts:128).
--    It is modelled as SECURITY DEFINER because the call shape carries no
--    p_order_id and therefore cannot pass reviews_insert_participant. This is
--    the RLS-bypassing path that decides the whole trigger-vs-policy design of
--    0126; the assertions must be able to reach it.
--  * public.delete_my_account_fixture and public.withdraw_response_fixture —
--    the SECURITY DEFINER paths that a restricted user must KEEP, so that
--    "a sanction is not an eviction" is tested rather than claimed.
--
-- reviews.order_id and reviews.l2_id are nullable here because the live types
-- say they are (src/types/database.ts:1206-1218), while migration 0012 declares
-- both NOT NULL. That divergence is recorded, not resolved: it is one more
-- reason the Git chain is not a production snapshot.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA auth;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOLOGIN;
  END IF;
END
$roles$;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

CREATE TYPE public.user_status AS ENUM ('active', 'suspended', 'banned', 'deleted');
CREATE TYPE public.order_status AS ENUM ('draft', 'open', 'in_progress', 'completed', 'cancelled', 'expired');
CREATE TYPE public.response_status AS ENUM ('sent', 'viewed', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE public.review_direction AS ENUM ('client_to_master', 'master_to_client');
CREATE TYPE public.review_status AS ENUM ('visible', 'hidden', 'pending');
CREATE TYPE public.report_target_type AS ENUM ('user', 'order', 'review', 'message');
CREATE TYPE public.report_status AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');
CREATE TYPE public.report_reason AS ENUM ('spam', 'fraud', 'inappropriate', 'fake_profile', 'fake_review', 'off_platform', 'safety', 'other');

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id          uuid PRIMARY KEY,
  first_name  text,
  is_master   boolean NOT NULL DEFAULT false,
  is_admin    boolean NOT NULL DEFAULT false,
  is_demo     boolean NOT NULL DEFAULT false,
  status      public.user_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories_l1 (id text PRIMARY KEY, name_ru text NOT NULL);
CREATE TABLE public.categories_l2 (
  id text PRIMARY KEY,
  l1_id text NOT NULL REFERENCES public.categories_l1(id),
  name_ru text NOT NULL
);

INSERT INTO public.categories_l1 (id, name_ru) VALUES ('construction', 'Строительство и ремонт');
INSERT INTO public.categories_l2 (id, l1_id, name_ru) VALUES
  ('plumbing', 'construction', 'Сантехника'),
  ('electrics', 'construction', 'Электрика');

CREATE TABLE public.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  picked_master_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  l2_id             text NOT NULL REFERENCES public.categories_l2(id),
  title             text NOT NULL,
  description       text,
  photo_urls        text[] NOT NULL DEFAULT ARRAY[]::text[],
  contact_name      text,
  city_id           text,
  district          text,
  cancel_reason     text,
  cancelled_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status            public.order_status NOT NULL DEFAULT 'open',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.order_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  master_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  l2_id       text NOT NULL REFERENCES public.categories_l2(id),
  message     text NOT NULL,
  lead_time   text,
  status      public.response_status NOT NULL DEFAULT 'sent',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, master_id)
);

CREATE TRIGGER order_responses_set_updated_at
BEFORE UPDATE ON public.order_responses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  direction   public.review_direction NOT NULL,
  l2_id       text REFERENCES public.categories_l2(id),
  rating      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        text,
  status      public.review_status NOT NULL DEFAULT 'visible',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_author_target_distinct CHECK (author_id <> target_id)
);

CREATE TRIGGER reviews_set_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type  public.report_target_type NOT NULL,
  target_id    uuid NOT NULL,
  reason       public.report_reason NOT NULL,
  description  text,
  status       public.report_status NOT NULL DEFAULT 'pending',
  reviewed_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  admin_note   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Admin helper, shape and ACL from 0030_admin_flag_and_policies.sql
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- APPLIED MIGRATION 0130 — already in production
-- ---------------------------------------------------------------------------
-- Shape copied from supabase/migrations/0130_guard_user_privilege_columns.sql.
-- The drafts must build on this, never recreate or replace it.

\if :{?p0130}
\else
  \set p0130 applied
\endif

-- psql does not interpolate :variables inside dollar-quoted bodies, so the mode
-- is handed to the server as a run-time parameter instead of being pasted in.
SELECT set_config('fixture.p0130', :'p0130', false) AS fixture_mode;

DO $p0130$
BEGIN
  IF current_setting('fixture.p0130', true) = 'applied' THEN
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION public.guard_user_privilege_columns()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = public, pg_temp
      AS $fn$
      BEGIN
        IF current_user = 'postgres' THEN
          RETURN NEW;
        END IF;
        IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
          RAISE EXCEPTION 'Изменение прав администратора запрещено'
            USING ERRCODE = '42501',
                  DETAIL = 'users.is_admin is managed by the database owner only';
        END IF;
        IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
          RAISE EXCEPTION 'Изменение признака тестового аккаунта запрещено'
            USING ERRCODE = '42501',
                  DETAIL = 'users.is_demo is managed by the database owner only';
        END IF;
        RETURN NEW;
      END
      $fn$;
    $ddl$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.guard_user_privilege_columns() FROM PUBLIC, anon, authenticated, service_role';
    EXECUTE 'CREATE TRIGGER users_guard_privilege_columns BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_user_privilege_columns()';

  ELSIF current_setting('fixture.p0130', true) = 'foreign' THEN
    -- Same name, unrelated object: SECURITY DEFINER, no is_admin anywhere, and
    -- no trigger on public.users. 0126 and 0128 must reject it by identity
    -- rather than accept it because the name matched.
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION public.guard_user_privilege_columns()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $fn$ BEGIN RETURN NEW; END $fn$;
    $ddl$;
  END IF;
END
$p0130$;

-- ---------------------------------------------------------------------------
-- RLS baseline. Nothing below may be renamed or rewritten by the drafts.
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 0001_init.sql
-- Live production has users_select_all USING (true), not the users_select_own
-- of migration 0001. Verified read-only 2026-08-30. The status guard reads
-- users.is_admin under the caller's own RLS, so modelling the real policy
-- matters; a narrower model would hide a failure mode instead of testing it.
CREATE POLICY users_select_all ON public.users
  FOR SELECT USING (true);
CREATE POLICY users_insert_own ON public.users
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- 0030_admin_flag_and_policies.sql
CREATE POLICY users_admin_update ON public.users
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- 0076_lifecycle_rls.sql
CREATE POLICY orders_read_open_or_own ON public.orders
  FOR SELECT USING (
    status = 'open'
    OR (SELECT auth.uid()) = client_id
    OR (SELECT auth.uid()) = picked_master_id
  );

-- 0009_orders_and_responses.sql
CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = client_id);

-- 0076_lifecycle_rls.sql
CREATE POLICY orders_owner_edit_open ON public.orders
  FOR UPDATE
  USING ((SELECT auth.uid()) = client_id AND status IN ('open', 'draft', 'cancelled', 'expired'))
  WITH CHECK ((SELECT auth.uid()) = client_id AND status IN ('open', 'draft', 'in_progress', 'cancelled', 'expired'));

-- 0092_fix_cancel_order_rls.sql
CREATE POLICY orders_owner_change_status_in_progress ON public.orders
  FOR UPDATE
  USING ((SELECT auth.uid()) = client_id AND status IN ('open', 'in_progress'))
  WITH CHECK ((SELECT auth.uid()) = client_id AND status IN ('open', 'cancelled', 'completed', 'in_progress'));
CREATE POLICY orders_owner_delete_open ON public.orders
  FOR DELETE USING ((SELECT auth.uid()) = client_id AND status IN ('open', 'draft'));

-- 0099_orders_owner_delete_history.sql
CREATE POLICY orders_owner_delete_history ON public.orders
  FOR DELETE USING ((SELECT auth.uid()) = client_id AND status IN ('cancelled', 'expired'));

-- 0009 / 0076
CREATE POLICY order_responses_read_participants ON public.order_responses
  FOR SELECT USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (SELECT client_id FROM public.orders WHERE id = order_responses.order_id)
  );
CREATE POLICY order_responses_insert_own ON public.order_responses
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);
CREATE POLICY order_responses_update_own_or_client ON public.order_responses
  FOR UPDATE USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (SELECT client_id FROM public.orders WHERE id = order_responses.order_id)
  );

-- 0012 / 0091 / 0030
CREATE POLICY reviews_read_visible ON public.reviews
  FOR SELECT USING (
    status = 'visible'
    OR (SELECT auth.uid()) = author_id
    OR (SELECT auth.uid()) = target_id
  );
CREATE POLICY reviews_insert_participant ON public.reviews
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND author_id <> target_id
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id AND status = 'completed'
        AND ((client_id = author_id AND picked_master_id = target_id)
             OR (picked_master_id = author_id AND client_id = target_id))
    )
  );
CREATE POLICY reviews_update_own ON public.reviews
  FOR UPDATE USING ((SELECT auth.uid()) = author_id)
  WITH CHECK ((SELECT auth.uid()) = author_id);
CREATE POLICY reviews_admin_update ON public.reviews
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- 0029 / 0030
CREATE POLICY reports_insert_own ON public.reports
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = reporter_id);
CREATE POLICY reports_select_own ON public.reports
  FOR SELECT USING ((SELECT auth.uid()) = reporter_id);
CREATE POLICY reports_admin_select ON public.reports
  FOR SELECT USING (public.is_current_user_admin());
CREATE POLICY reports_admin_update ON public.reports
  FOR UPDATE USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER paths that exist in the live database
-- ---------------------------------------------------------------------------

-- Shape of the live RPC public.submit_master_review(p_target_id, p_rating,
-- p_text), which has no migration file. SECURITY DEFINER, no order binding, no
-- RLS. If gap Р3 were closed with an RLS policy on public.reviews, this path
-- would sail straight through it.
CREATE FUNCTION public.submit_master_review_fixture(
  p_target_id uuid,
  p_rating int,
  p_text text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.reviews (order_id, author_id, target_id, direction, rating, text)
  VALUES (NULL, auth.uid(), p_target_id, 'client_to_master', p_rating, p_text)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_master_review_fixture(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_master_review_fixture(uuid, int, text) TO authenticated;

-- 0081_lifecycle_rpcs_security_definer.sql shape: a status-only write that a
-- restricted master must keep, so they are never trapped with a live response.
CREATE FUNCTION public.withdraw_response_fixture(p_response_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.order_responses
  SET status = 'withdrawn'
  WHERE id = p_response_id AND master_id = auth.uid();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_response_fixture(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_response_fixture(uuid) TO authenticated;

-- 0088_delete_my_account.sql shape: SECURITY DEFINER, sets users.status to
-- 'deleted' and cancels the caller's open orders. It must keep working after
-- users.status becomes moderator-managed, otherwise the App Store account
-- deletion requirement breaks.
CREATE FUNCTION public.delete_my_account_fixture()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  UPDATE public.orders SET status = 'cancelled'
  WHERE client_id = auth.uid() AND status = 'open';
  UPDATE public.users SET status = 'deleted' WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account_fixture() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account_fixture() TO authenticated;

-- 0024_expire_orders_cron.sql shape: a server path with no JWT identity. It must
-- keep working for restricted users' orders, otherwise expiry silently stops.
CREATE FUNCTION public.expire_old_orders_fixture()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.orders SET status = 'expired' WHERE status = 'open';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_old_orders_fixture() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Assertion helpers
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER on purpose: the inner statement must run with the calling
-- role's privileges and row level security, otherwise it measures nothing.
CREATE FUNCTION public.fx_assert_denied(p_label text, p_sql text, p_expect_detail text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_detail text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_message = MESSAGE_TEXT;
    IF p_expect_detail IS NOT NULL AND v_detail IS DISTINCT FROM p_expect_detail THEN
      RAISE EXCEPTION 'ASSERT FAIL [%]: denied for the wrong reason. expected DETAIL=% got DETAIL=% MESSAGE=%',
        p_label, p_expect_detail, COALESCE(v_detail, '<none>'), v_message;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERT FAIL [%]: the statement was NOT denied', p_label;
END;
$$;

CREATE FUNCTION public.fx_assert_allowed(p_label text, p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_message text;
  v_detail text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_message = MESSAGE_TEXT;
    RAISE EXCEPTION 'ASSERT FAIL [%]: the statement was denied. MESSAGE=% DETAIL=%',
      p_label, v_message, COALESCE(v_detail, '<none>');
  END;
END;
$$;

CREATE FUNCTION public.fx_assert(p_label text, p_condition boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]', p_label;
  END IF;
END;
$$;

-- Counts rows the way a reader sees them, under the caller's own RLS.
CREATE FUNCTION public.fx_visible_orders()
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT count(*) FROM public.orders;
$$;

CREATE FUNCTION public.fx_become(p_actor uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), false);
$$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_assert_denied(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_assert_allowed(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_assert(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_visible_orders() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_become(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- admin_m   f0000000-…-000f  moderator
-- client_a  10000000-…-0001  ordinary client, control
-- master_b  20000000-…-0002  ordinary master, control
-- client_s  30000000-…-0003  client who will be suspended
-- master_s  40000000-…-0004  master who will be suspended

INSERT INTO public.users (id, first_name, is_master, is_admin) VALUES
  ('f0000000-0000-4000-8000-00000000000f', 'Модератор', false, true),
  ('10000000-0000-4000-8000-000000000001', 'Клиент А',  false, false),
  ('20000000-0000-4000-8000-000000000002', 'Мастер Б',  true,  false),
  ('30000000-0000-4000-8000-000000000003', 'Клиент С',  false, false),
  ('40000000-0000-4000-8000-000000000004', 'Мастер С',  true,  false);

INSERT INTO public.orders (id, client_id, l2_id, title, description, city_id, status) VALUES
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'plumbing', 'Течёт кран', 'Кухня', 'nazran', 'open'),
  ('60000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003', 'plumbing', 'Установить смеситель', 'Ванная', 'nazran', 'open'),
  -- the order that will be reported and hidden in the Р5 assertions
  ('70000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'plumbing', 'Спорное объявление', 'Текст жалобы', 'nazran', 'open'),
  -- a cancelled order of client_a: invisible to non-participants under the
  -- baseline. Used to prove orders_admin_select is what lets a moderator see
  -- the subject of a report, and that hiding is not entangled with status.
  ('80000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'plumbing', 'Закрытое объявление', NULL, 'nazran', 'cancelled');

INSERT INTO public.order_responses (id, order_id, master_id, l2_id, message) VALUES
  ('a0000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'plumbing', 'Приеду сегодня'),
  ('b0000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000004', 'plumbing', 'Сделаю дешевле');

-- A freeform review created through the RLS-bypassing RPC shape, so the edit
-- guard has something real to protect.
INSERT INTO public.reviews (id, order_id, author_id, target_id, direction, rating, text) VALUES
  ('c0000000-0000-4000-8000-00000000000c', NULL, '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'client_to_master', 5, 'Хороший мастер');

INSERT INTO public.reports (id, reporter_id, target_type, target_id, reason, description) VALUES
  ('d0000000-0000-4000-8000-00000000000d', '30000000-0000-4000-8000-000000000003', 'order', '70000000-0000-4000-8000-000000000007', 'inappropriate', 'Недопустимый текст');

-- ---------------------------------------------------------------------------
-- Baselines captured BEFORE the drafts
-- ---------------------------------------------------------------------------

CREATE TABLE public.fixture_policy_baseline AS
SELECT schemaname, tablename, policyname, permissive, roles::text AS roles,
       cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

CREATE TABLE public.fixture_visibility_probe (
  phase       text NOT NULL,
  actor_label text NOT NULL,
  relname     text NOT NULL,
  row_id      uuid NOT NULL
);

CREATE FUNCTION public.fixture_capture_visibility(p_phase text, p_label text, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), false);

  INSERT INTO public.fixture_visibility_probe (phase, actor_label, relname, row_id)
  SELECT p_phase, p_label, 'orders', order_row.id FROM public.orders AS order_row;

  INSERT INTO public.fixture_visibility_probe (phase, actor_label, relname, row_id)
  SELECT p_phase, p_label, 'order_responses', response_row.id FROM public.order_responses AS response_row;

  INSERT INTO public.fixture_visibility_probe (phase, actor_label, relname, row_id)
  SELECT p_phase, p_label, 'reviews', review_row.id FROM public.reviews AS review_row;
END;
$$;

GRANT INSERT, SELECT ON TABLE public.fixture_visibility_probe TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fixture_capture_visibility(text, text, uuid) TO anon, authenticated;

SET ROLE anon;
SELECT public.fixture_capture_visibility('before', 'anon', NULL);
RESET ROLE;

SET ROLE authenticated;
SELECT public.fixture_capture_visibility('before', 'admin_m',  'f0000000-0000-4000-8000-00000000000f');
SELECT public.fixture_capture_visibility('before', 'client_a', '10000000-0000-4000-8000-000000000001');
SELECT public.fixture_capture_visibility('before', 'master_b', '20000000-0000-4000-8000-000000000002');
SELECT public.fixture_capture_visibility('before', 'client_s', '30000000-0000-4000-8000-000000000003');
SELECT public.fixture_capture_visibility('before', 'master_s', '40000000-0000-4000-8000-000000000004');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

-- ---------------------------------------------------------------------------
-- Proof that the CURRENT state really is broken
-- ---------------------------------------------------------------------------
-- These assertions run BEFORE the drafts. If any of them fails, the gaps this
-- work claims to close do not exist in the modelled baseline, and every later
-- "after" assertion would be proving nothing.

DO $current_state_is_broken$
DECLARE
  v_ok boolean;
BEGIN
  -- Р3: users.status appears in no policy expression governing publication.
  IF EXISTS (
    SELECT 1 FROM public.fixture_policy_baseline
    WHERE tablename IN ('orders', 'order_responses', 'reviews')
      AND (COALESCE(qual, '') || COALESCE(with_check, '')) ILIKE '%user%status%'
  ) THEN
    RAISE EXCEPTION 'FIXTURE FAIL: baseline already consults a user status in an orders/responses/reviews policy';
  END IF;

  -- Р5: no admin policy on orders at all.
  IF EXISTS (
    SELECT 1 FROM public.fixture_policy_baseline
    WHERE tablename = 'orders' AND (COALESCE(qual, '') ILIKE '%is_admin%')
  ) THEN
    RAISE EXCEPTION 'FIXTURE FAIL: baseline already has an admin policy on public.orders';
  END IF;

  -- Р3 core: a suspended user can currently lift their own suspension, because
  -- authenticated holds a table-wide UPDATE grant on public.users. Migration
  -- 0130 neutralised the is_admin half with a trigger and deliberately left the
  -- GRANT alone, so both column privileges are still present live (verified
  -- read-only 2026-08-30) and the status half is still exploitable.
  SELECT has_column_privilege('authenticated', 'public.users', 'status', 'UPDATE')
     AND has_column_privilege('authenticated', 'public.users', 'is_admin', 'UPDATE')
  INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'FIXTURE FAIL: the broad column grant this work exists to neutralise is missing from the baseline';
  END IF;
END
$current_state_is_broken$;

-- The remaining bypass, executed once so it is a demonstrated fact and not a
-- description: after migration 0130 a user can no longer promote itself, but it
-- can still set and clear its own status. That gap is exactly what 0126 closes,
-- and asserting it here means the "after" assertions are measuring a real change.
DO $baseline_bypass$
BEGIN
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.fx_become('30000000-0000-4000-8000-000000000003');

  PERFORM public.fx_assert_allowed(
    'BASELINE: a user can set their own status',
    $$UPDATE public.users SET status = 'suspended' WHERE id = '30000000-0000-4000-8000-000000000003'$$);
  PERFORM public.fx_assert_allowed(
    'BASELINE: a suspended user can un-suspend itself',
    $$UPDATE public.users SET status = 'active' WHERE id = '30000000-0000-4000-8000-000000000003'$$);

  IF current_setting('fixture.p0130', true) = 'applied' THEN
    -- Already closed in production. If this ever starts passing, migration 0130
    -- has been lost and the whole moderation stack is unsafe.
    PERFORM public.fx_assert_denied(
      'BASELINE: migration 0130 already blocks self-promotion',
      $$UPDATE public.users SET is_admin = true WHERE id = '30000000-0000-4000-8000-000000000003'$$,
      'users.is_admin is managed by the database owner only');
    PERFORM public.fx_assert_denied(
      'BASELINE: migration 0130 already blocks the demo flag',
      $$UPDATE public.users SET is_demo = true WHERE id = '30000000-0000-4000-8000-000000000003'$$,
      'users.is_demo is managed by the database owner only');
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', false);
END
$baseline_bypass$;

DO $baseline_sanity$
DECLARE
  v_orders bigint;
BEGIN
  SELECT count(*) INTO v_orders
  FROM public.fixture_visibility_probe
  WHERE phase = 'before' AND actor_label = 'anon' AND relname = 'orders';

  -- Comparing two empty sets would prove nothing later.
  IF v_orders = 0 THEN
    RAISE EXCEPTION 'FIXTURE FAIL: the anonymous baseline feed is empty';
  END IF;

  IF (SELECT count(*) FROM public.users WHERE status <> 'active') > 0 THEN
    RAISE EXCEPTION 'FIXTURE FAIL: the fixture must start with every account active';
  END IF;

  IF (SELECT count(*) FROM public.users WHERE is_admin) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE FAIL: exactly one moderator is expected at the start';
  END IF;
END
$baseline_sanity$;

\echo 'PREFLIGHT OK: fixture built for p0130 mode' :p0130 '— baselines captured, the remaining gap demonstrated'
