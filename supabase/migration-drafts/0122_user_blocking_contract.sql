-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- 0122_user_blocking_contract.sql
--
-- Apple UGC safety contract: a user can block another user and the block is
-- enforced in both directions for signed-in order/feed reads, response reads
-- and mutations, and master contact lookup. Existing permissive policies are
-- not renamed or guessed; uniquely named RESTRICTIVE policies compose with
-- them using AND semantics.
--
-- Anonymous visitors have no identity against which a personal block list can
-- be evaluated, so the existing guest feed remains backward-compatible.
-- Contact rollout is different: CURRENT/old iOS intentionally exposes the
-- master's public work number from the catalogue, while the universal-board
-- TARGET narrows lookup to an authenticated order client after a response. The
-- preflight below aborts unless that compatibility phase happened first.
-- This draft does NOT claim full block enforcement across profiles, push,
-- Realtime, storage or every RPC. Those live surfaces remain explicit,
-- machine-readable promotion blockers below.

BEGIN;

DO $guard$
DECLARE
  v_contact_definition text;
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_responses') IS NULL
     OR to_regclass('public.reports') IS NULL THEN
    RAISE EXCEPTION 'user_blocking_schema_missing'
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('public.get_master_phone(uuid)') IS NULL THEN
    RAISE EXCEPTION 'user_blocking_get_master_phone_missing_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'contact_phone'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_responses'
      AND column_name = 'master_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'client_id'
  ) THEN
    RAISE EXCEPTION 'user_blocking_contact_contract_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  v_contact_definition := pg_get_functiondef(
    to_regprocedure('public.get_master_phone(uuid)')
  );

  -- users.contact_phone is an explicitly public work number chosen by a master;
  -- users_private.phone is the private login identifier. This guard is about
  -- WHEN the public work number is disclosed, not about reclassifying it as PII.
  -- Do not silently revoke the CURRENT catalogue flow from old iOS: first ship
  -- and observe the compatible client/contact phase, then promote this draft.
  IF has_function_privilege('anon', 'public.get_master_phone(uuid)', 'EXECUTE')
     OR has_column_privilege('anon', 'public.users', 'contact_phone', 'SELECT')
     OR has_column_privilege('authenticated', 'public.users', 'contact_phone', 'SELECT')
     OR v_contact_definition ~* 'users_private|auth[.]users|upr[.]phone'
     OR v_contact_definition !~* 'contact_phone'
     OR v_contact_definition !~* 'order_responses'
     OR v_contact_definition !~* 'order_row[.]client_id = auth[.]uid[(][)]' THEN
    RAISE EXCEPTION 'user_blocking_contact_visibility_phase_not_ready'
      USING ERRCODE = 'P0001',
            HINT = 'Audit live RPC/table/column ACL and RLS, remove private fallback and direct contact_phone reads, ship a compatible client phase, then require authenticated client-after-response contact.';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

COMMENT ON TABLE public.user_blocks IS
  'Owner-managed UGC safety blocks. A pair blocks visibility and interaction in both directions.';

CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx
  ON public.user_blocks (blocked_id, blocker_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = blocker_id);

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

REVOKE ALL ON TABLE public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_blocks TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_can_interact_with(p_other_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN p_other_id IS NULL THEN false
    WHEN auth.uid() = p_other_id THEN true
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.user_blocks AS block_row
      WHERE (block_row.blocker_id = auth.uid() AND block_row.blocked_id = p_other_id)
         OR (block_row.blocker_id = p_other_id AND block_row.blocked_id = auth.uid())
    )
  END;
$function$;

COMMENT ON FUNCTION public.current_user_can_interact_with(uuid) IS
  'Authenticated caller relationship guard. Anonymous or null targets fail closed.';

REVOKE ALL ON FUNCTION public.current_user_can_interact_with(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_interact_with(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.current_user_can_interact_with(uuid) FROM authenticated;
-- The anonymous order policy must be able to evaluate this helper even though
-- PostgreSQL does not guarantee boolean short-circuiting. Anonymous calls still
-- return false and disclose no relationship state.
GRANT EXECUTE ON FUNCTION public.current_user_can_interact_with(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS orders_block_relation_restrictive ON public.orders;
CREATE POLICY orders_block_relation_restrictive ON public.orders
  AS RESTRICTIVE
  FOR SELECT TO anon, authenticated
  USING (
    (SELECT auth.uid()) IS NULL
    OR (SELECT auth.uid()) = client_id
    OR public.current_user_can_interact_with(client_id)
  );

COMMENT ON POLICY orders_block_relation_restrictive ON public.orders IS
  'Signed-in direct URL/feed reads are hidden when the viewer and order owner blocked each other.';

DROP POLICY IF EXISTS order_responses_block_relation_select_restrictive
  ON public.order_responses;
CREATE POLICY order_responses_block_relation_select_restrictive
  ON public.order_responses
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    public.current_user_can_interact_with(master_id)
    AND public.current_user_can_interact_with(
      (SELECT order_row.client_id
       FROM public.orders AS order_row
       WHERE order_row.id = order_responses.order_id)
    )
  );

DROP POLICY IF EXISTS order_responses_block_relation_insert_restrictive
  ON public.order_responses;
CREATE POLICY order_responses_block_relation_insert_restrictive
  ON public.order_responses
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_can_interact_with(master_id)
    AND public.current_user_can_interact_with(
      (SELECT order_row.client_id
       FROM public.orders AS order_row
       WHERE order_row.id = order_responses.order_id)
    )
  );

DROP POLICY IF EXISTS order_responses_block_relation_update_restrictive
  ON public.order_responses;
CREATE POLICY order_responses_block_relation_update_restrictive
  ON public.order_responses
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    public.current_user_can_interact_with(master_id)
    AND public.current_user_can_interact_with(
      (SELECT order_row.client_id
       FROM public.orders AS order_row
       WHERE order_row.id = order_responses.order_id)
    )
  )
  WITH CHECK (
    public.current_user_can_interact_with(master_id)
    AND public.current_user_can_interact_with(
      (SELECT order_row.client_id
       FROM public.orders AS order_row
       WHERE order_row.id = order_responses.order_id)
    )
  );

-- Preserve the one-argument ABI after the separately gated compatibility phase.
-- contact_phone remains the master's public work number. The security boundary
-- is disclosure timing: universal-board clients receive it only after the
-- master responded to their order, and blocking closes that interaction.
CREATE OR REPLACE FUNCTION public.get_master_phone(p_master_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $function$
  SELECT pu.contact_phone
  FROM public.users AS pu
  WHERE pu.id = p_master_id
    AND auth.uid() IS NOT NULL
    AND pu.is_master = true
    AND pu.status = 'active'
    AND nullif(trim(pu.contact_phone), '') IS NOT NULL
    AND public.current_user_can_interact_with(p_master_id)
    AND EXISTS (
      SELECT 1
      FROM public.order_responses AS response
      JOIN public.orders AS order_row ON order_row.id = response.order_id
      WHERE response.master_id = p_master_id
        AND order_row.client_id = auth.uid()
    );
$function$;

REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_master_phone(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.universal_backend_promotion_blockers (
  blocker_key text PRIMARY KEY,
  surface text NOT NULL,
  requirement text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolution_evidence text,
  resolved_at timestamptz,
  CONSTRAINT universal_backend_blocker_resolution_evidence_check CHECK (
    (NOT resolved AND resolution_evidence IS NULL AND resolved_at IS NULL)
    OR (
      resolved
      AND nullif(trim(resolution_evidence), '') IS NOT NULL
      AND resolved_at IS NOT NULL
    )
  )
);

COMMENT ON TABLE public.universal_backend_promotion_blockers IS
  'Draft promotion gate. Synthetic success is not production approval; every live surface must have snapshot-backed evidence in a newly numbered migration.';

INSERT INTO public.universal_backend_promotion_blockers (
  blocker_key,
  surface,
  requirement
) VALUES
  (
    'notification_matching_live_audit',
    'database notification triggers',
    'Inventory and replace or guard every order/response notification path so delivery requires matching_enabled L1/L2, published moderation, verified master where required, and no block in either direction.'
  ),
  (
    'security_definer_rpc_inventory_live_audit',
    'SECURITY DEFINER and RPC',
    'Inventory every live SECURITY DEFINER/RPC owner, search_path, grants, row_security behavior, profile/contact disclosure and block bypass before promotion.'
  ),
  (
    'blocking_profile_visibility_live_audit',
    'profile reads and search',
    'Prove blocked users are mutually hidden in every profile, catalogue, search and direct-ID path without weakening public catalogue compatibility accidentally.'
  ),
  (
    'blocking_push_realtime_live_audit',
    'push and Realtime',
    'Prove both directions of a block suppress push payload creation, queued delivery and Realtime subscriptions/events.'
  ),
  (
    'blocking_storage_policy_live_audit',
    'storage buckets and signed URLs',
    'Audit bucket/object policies, signed URL issuance and cached media behavior for blocked profile/order/response assets.'
  ),
  (
    'verification_eligibility_live_audit',
    'master verification',
    'Bind requires_verification to the audited live master verification source and enforce it consistently in responses, matching and notifications.'
  )
ON CONFLICT (blocker_key) DO NOTHING;

ALTER TABLE public.universal_backend_promotion_blockers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.universal_backend_promotion_blockers
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_universal_backend_promotion_ready()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_unresolved text;
BEGIN
  SELECT string_agg(blocker_key, ', ' ORDER BY blocker_key)
  INTO v_unresolved
  FROM public.universal_backend_promotion_blockers
  WHERE NOT resolved;

  IF v_unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'universal_backend_promotion_blocked: %', v_unresolved
      USING ERRCODE = 'P0001',
            HINT = 'Resolve against a live read-only snapshot and backup, record evidence in a newly numbered forward-only migration, then rerun the restored-snapshot role matrix.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_universal_backend_promotion_ready()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_universal_backend_promotion_ready()
  TO service_role;

ALTER TYPE public.report_target_type ADD VALUE IF NOT EXISTS 'response';

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_no_new_message_targets;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_no_new_message_targets
  CHECK (target_type <> 'message') NOT VALID;

COMMENT ON TYPE public.report_target_type IS
  'UGC report targets: user, order, review, response, and legacy message. A NOT VALID check preserves historical rows but rejects new message reports.';

COMMIT;
