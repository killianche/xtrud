-- Isolated local fixture that models the CURRENT, published state of the
-- backend as it can be read from the Git migration chain. It is not a
-- production schema backup and proves nothing about live divergence.
--
-- Why this file exists next to universal-preflight-fixture.sql:
-- that fixture models the POST-contact-compatibility world (a narrowed
-- get_master_phone, anon without EXECUTE, no direct contact_phone column
-- grant). Running the blocking contract on it would prove compatibility with a
-- world that does not exist yet. This fixture instead reproduces what the
-- published iOS 1.0.1 actually talks to:
--
--   * public.get_master_phone as in supabase/migrations/0098_get_master_phone_contact_first.sql
--     — COALESCE(users.contact_phone, users_private.phone), EXECUTE granted to
--     anon and authenticated;
--   * broad Supabase-style table grants and default privileges for the API
--     roles, matching the "broad column grants" finding recorded in
--     supabase/migration-drafts/security_hardening_live_verified.sql;
--   * the PERMISSIVE policy baseline from migrations 0009 and 0076.
--
-- A blocking migration that stays green here has been proven not to require
-- the unrelated contact-visibility phase.

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
END
$roles$;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Supabase grants broad default privileges on newly created public tables to
-- the API roles. Reproducing that here is load-bearing: it is the reason a
-- migration that creates a table MUST state its grants explicitly instead of
-- inheriting them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TYPE public.order_status AS ENUM ('draft', 'open', 'cancelled', 'expired');

CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  contact_phone text,
  is_master boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.users_private (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone text
);

CREATE TABLE public.categories_l1 (
  id text PRIMARY KEY,
  name_ru text NOT NULL
);

CREATE TABLE public.categories_l2 (
  id text PRIMARY KEY,
  l1_id text NOT NULL REFERENCES public.categories_l1(id),
  name_ru text NOT NULL
);

INSERT INTO public.categories_l1 (id, name_ru) VALUES
  ('construction', 'Строительство и ремонт');
INSERT INTO public.categories_l2 (id, l1_id, name_ru) VALUES
  ('plumbing', 'construction', 'Сантехника');

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.users(id),
  picked_master_id uuid REFERENCES public.users(id),
  l2_id text NOT NULL REFERENCES public.categories_l2(id),
  status public.order_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  master_id uuid NOT NULL REFERENCES public.users(id),
  l2_id text NOT NULL REFERENCES public.categories_l2(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_responses ENABLE ROW LEVEL SECURITY;

-- PERMISSIVE baseline copied in shape from migrations 0009 and 0076.
-- These policies are the ones the blocking migration must NOT touch.
CREATE POLICY orders_read_open_or_own ON public.orders
  FOR SELECT
  USING (
    status = 'open'
    OR (SELECT auth.uid()) = client_id
    OR (SELECT auth.uid()) = picked_master_id
  );

CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = client_id);

CREATE POLICY orders_update_own ON public.orders
  FOR UPDATE USING ((SELECT auth.uid()) = client_id)
  WITH CHECK ((SELECT auth.uid()) = client_id);

CREATE POLICY order_responses_read_participants ON public.order_responses
  FOR SELECT USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (
      SELECT client_id FROM public.orders WHERE id = order_responses.order_id
    )
  );

CREATE POLICY order_responses_insert_own ON public.order_responses
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = master_id);

CREATE POLICY order_responses_update_own_or_client ON public.order_responses
  FOR UPDATE USING (
    (SELECT auth.uid()) = master_id
    OR (SELECT auth.uid()) IN (
      SELECT client_id FROM public.orders WHERE id = order_responses.order_id
    )
  );

-- CURRENT contact behaviour, verbatim in shape from migration 0098.
-- The blocking migration must leave this function and its ACL untouched.
CREATE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(pu.contact_phone, upr.phone)
  FROM public.users pu
  LEFT JOIN public.users_private upr ON upr.user_id = pu.id
  WHERE pu.id = p_master_id
    AND pu.is_master = true
    AND pu.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_master_phone(uuid) TO anon, authenticated;

-- Migration 0081 turned the lifecycle RPCs into SECURITY DEFINER so they could
-- reach notify_user. They therefore run as the table owner and are NOT subject
-- to RLS. Modelled here so the claim "a blocked master is never trapped" is
-- testable rather than asserted.
CREATE FUNCTION public.withdraw_response_fixture(p_response_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.order_responses
  SET created_at = created_at
  WHERE id = p_response_id AND master_id = auth.uid();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_response_fixture(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_response_fixture(uuid) TO authenticated;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- client_a  10000000-...-0001  order owner, will block master_b
-- master_b  20000000-...-0002  responds to client_a and to client_d
-- master_c  30000000-...-0003  unrelated master, control
-- client_d  40000000-...-0004  unrelated order owner, control

INSERT INTO public.users (id, is_master, contact_phone) VALUES
  ('10000000-0000-4000-8000-000000000001', false, NULL),
  ('20000000-0000-4000-8000-000000000002', true,  '+79000000000'),
  ('30000000-0000-4000-8000-000000000003', true,  NULL),
  ('40000000-0000-4000-8000-000000000004', false, NULL);

-- master_c has no public contact_phone: the 0098 fallback to the private login
-- identifier is part of the CURRENT behaviour this fixture must reproduce.
INSERT INTO public.users_private (user_id, phone) VALUES
  ('30000000-0000-4000-8000-000000000003', '+79000000003');

INSERT INTO public.orders (id, client_id, l2_id, status) VALUES
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'plumbing', 'open'),
  ('60000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000004', 'plumbing', 'open'),
  -- cancelled order of client_a: invisible to non-participants under the
  -- PERMISSIVE baseline. Used to prove blocking is not entangled with status.
  ('70000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'plumbing', 'cancelled'),
  -- second cancelled order of client_a, used by master_c: a viewer who holds an
  -- UNRELATED block must not lose sight of its own response here. This is the
  -- only shape in which coupling the response policy to order visibility
  -- actually regresses, and it needs a non-empty block array to appear.
  ('80000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'plumbing', 'cancelled');

INSERT INTO public.order_responses (id, order_id, master_id, l2_id) VALUES
  ('a0000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'plumbing'),
  ('b0000000-0000-4000-8000-00000000000b', '60000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003', 'plumbing'),
  ('c0000000-0000-4000-8000-00000000000c', '70000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', 'plumbing'),
  ('d0000000-0000-4000-8000-00000000000d', '80000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000003', 'plumbing');

-- The exact set of seeded rows. Later phases legitimately create new rows
-- (the "a block is not a ban" positive control), so rollback equivalence is
-- compared over this fixed set rather than over whatever happens to exist.
CREATE TABLE public.fixture_seeded_rows AS
SELECT 'orders'::text AS relname, order_row.id AS row_id FROM public.orders AS order_row
UNION ALL
SELECT 'order_responses'::text, response_row.id FROM public.order_responses AS response_row;

-- ---------------------------------------------------------------------------
-- Baselines captured BEFORE the blocking migration
-- ---------------------------------------------------------------------------

CREATE TABLE public.fixture_policy_baseline AS
SELECT schemaname, tablename, policyname, permissive, roles::text AS roles,
       cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

CREATE TABLE public.fixture_visibility_probe (
  phase text NOT NULL,
  actor_label text NOT NULL,
  relname text NOT NULL,
  row_id uuid NOT NULL
);

-- SECURITY INVOKER on purpose: the capture must run under the calling role's
-- row level security, otherwise it would measure nothing.
CREATE FUNCTION public.fixture_capture_visibility(
  p_phase text,
  p_label text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), false);

  INSERT INTO public.fixture_visibility_probe (phase, actor_label, relname, row_id)
  SELECT p_phase, p_label, 'orders', order_row.id
  FROM public.orders AS order_row;

  INSERT INTO public.fixture_visibility_probe (phase, actor_label, relname, row_id)
  SELECT p_phase, p_label, 'order_responses', response_row.id
  FROM public.order_responses AS response_row;
END;
$$;

GRANT INSERT, SELECT ON TABLE public.fixture_visibility_probe
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fixture_capture_visibility(text, text, uuid)
  TO anon, authenticated;

SET ROLE anon;
SELECT public.fixture_capture_visibility('before', 'anon', NULL);
RESET ROLE;

SET ROLE authenticated;
SELECT public.fixture_capture_visibility('before', 'client_a', '10000000-0000-4000-8000-000000000001');
SELECT public.fixture_capture_visibility('before', 'master_b', '20000000-0000-4000-8000-000000000002');
SELECT public.fixture_capture_visibility('before', 'master_c', '30000000-0000-4000-8000-000000000003');
SELECT public.fixture_capture_visibility('before', 'client_d', '40000000-0000-4000-8000-000000000004');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

DO $baseline_sanity$
DECLARE
  v_orders bigint;
  v_responses bigint;
BEGIN
  SELECT count(*) INTO v_orders
  FROM public.fixture_visibility_probe
  WHERE phase = 'before' AND relname = 'orders';

  SELECT count(*) INTO v_responses
  FROM public.fixture_visibility_probe
  WHERE phase = 'before' AND relname = 'order_responses';

  -- Comparing two empty sets would prove nothing later.
  IF v_orders = 0 OR v_responses = 0 THEN
    RAISE EXCEPTION 'blocking_fixture_baseline_is_empty: orders=% responses=%',
      v_orders, v_responses;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fixture_visibility_probe
    WHERE phase = 'before' AND actor_label = 'anon' AND relname = 'orders'
  ) THEN
    RAISE EXCEPTION 'blocking_fixture_anonymous_feed_baseline_is_empty';
  END IF;
END
$baseline_sanity$;

\echo 'PREFLIGHT OK: current-state fixture built, baselines captured'
