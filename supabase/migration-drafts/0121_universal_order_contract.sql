-- DRAFT ONLY — DO NOT APPLY TO PRODUCTION OR INCLUDE IN MIGRATION RUNNERS.
-- Promotion requires the live read-only schema/ACL/RLS snapshot, encrypted
-- backup, rehearsal restore and a newly numbered forward-only migration.
-- 0121_universal_order_contract.sql
--
-- Additive database contract for publishing universal service orders without a
-- second task entity. The legacy iOS 1.0.1 insert remains valid because every
-- new NOT NULL field has a safe default and orders.l2_id remains NOT NULL.
--
-- SECURITY GATE: this draft intentionally does not replace RLS, grants or
-- SECURITY DEFINER functions. Those require a live read-only export, backup
-- and a separate forward-only security migration before production use.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_responses') IS NULL
     OR to_regclass('public.users') IS NULL
     OR to_regclass('public.categories_l1') IS NULL
     OR to_regclass('public.categories_l2') IS NULL
     OR to_regclass('public.categories_l3') IS NULL THEN
    RAISE EXCEPTION 'universal_order_schema_missing'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'l2_id'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'l3_ids'
  ) THEN
    RAISE EXCEPTION 'universal_order_legacy_category_shape_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  -- The draft uses the standard Supabase service_role only as a trusted
  -- database execution boundary. Promotion must still reconcile its exact
  -- live grants and JWT/runtime path; no application "admin" flag is guessed.
  IF to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'universal_order_service_role_requires_live_preflight'
      USING ERRCODE = 'P0001';
  END IF;
END
$guard$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS primary_l3_id text
    REFERENCES public.categories_l3(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS classification_status text NOT NULL DEFAULT 'legacy'
    CHECK (classification_status IN ('legacy', 'pending', 'classified')),
  ADD COLUMN IF NOT EXISTS classification_source text NOT NULL DEFAULT 'legacy'
    CHECK (
      classification_source IN (
        'legacy', 'user_category', 'search_suggestion', 'fallback', 'moderator'
      )
    ),
  ADD COLUMN IF NOT EXISTS requested_service_text text
    CHECK (
      requested_service_text IS NULL
      OR length(trim(requested_service_text)) BETWEEN 2 AND 500
    ),
  ADD COLUMN IF NOT EXISTS classification_note text
    CHECK (classification_note IS NULL OR length(classification_note) <= 240),
  ADD COLUMN IF NOT EXISTS classification_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'published'
    CHECK (moderation_status IN ('published', 'under_review', 'hidden', 'rejected')),
  ADD COLUMN IF NOT EXISTS moderation_reason_code text
    CHECK (
      moderation_reason_code IS NULL
      OR length(moderation_reason_code) BETWEEN 2 AND 80
    ),
  ADD COLUMN IF NOT EXISTS publish_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS work_mode text NOT NULL DEFAULT 'onsite'
    CHECK (work_mode IN ('onsite', 'remote')),
  ADD COLUMN IF NOT EXISTS location_scope text
    CHECK (location_scope IN ('region_wide', 'city', 'district', 'remote'));

COMMENT ON COLUMN public.orders.primary_l3_id IS
  'Single exact service used for ranking; must belong to orders.l2_id and be included in l3_ids.';
COMMENT ON COLUMN public.orders.classification_status IS
  'legacy for old-client inserts, pending for free-form fallback, classified after an L2 (optionally L3) assignment.';
COMMENT ON COLUMN public.orders.classification_source IS
  'Who supplied the current classification. This is classification metadata, not a lifecycle state.';
COMMENT ON COLUMN public.orders.requested_service_text IS
  'Immutable original free-form service intent. Required for fallback and preserved after moderator classification.';
COMMENT ON COLUMN public.orders.moderation_status IS
  'Content moderation state only; it does not select a master or create an in-app deal lifecycle.';
COMMENT ON COLUMN public.orders.publish_idempotency_key IS
  'Client-generated UUID for retry-safe publication. Old clients receive a server default.';
COMMENT ON COLUMN public.orders.work_mode IS
  'onsite includes region-wide, city and district scopes; remote has no geographic filter.';
COMMENT ON COLUMN public.orders.location_scope IS
  'Explicit geographic meaning. Legacy clients may omit it: a trigger derives region_wide/city/district from city_id and district.';

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_publish_idempotency_uidx
  ON public.orders (client_id, publish_idempotency_key);

CREATE INDEX IF NOT EXISTS orders_open_created_id_cursor_idx
  ON public.orders (created_at DESC, id DESC)
  WHERE status = 'open' AND moderation_status = 'published';

CREATE INDEX IF NOT EXISTS orders_open_l2_created_id_cursor_idx
  ON public.orders (l2_id, created_at DESC, id DESC)
  WHERE status = 'open' AND moderation_status = 'published';

CREATE INDEX IF NOT EXISTS orders_open_city_created_id_cursor_idx
  ON public.orders (city_id, created_at DESC, id DESC)
  WHERE status = 'open' AND moderation_status = 'published';

DO $existing_data_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE city_id IS NOT NULL
      AND nullif(btrim(district::text), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'universal_order_existing_ambiguous_location_requires_live_reconciliation'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders AS o
    CROSS JOIN LATERAL unnest(o.l3_ids) AS selected_l3(id)
    LEFT JOIN public.categories_l3 AS l3 ON l3.id = selected_l3.id
    WHERE selected_l3.id IS NULL
       OR l3.id IS NULL
       OR l3.l2_id <> o.l2_id
  ) THEN
    RAISE EXCEPTION 'universal_order_existing_l3_mismatch_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE cardinality(l3_ids) > 10
  ) THEN
    RAISE EXCEPTION 'universal_order_existing_l3_limit_requires_live_reconciliation'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_responses AS response
    JOIN public.orders AS order_row ON order_row.id = response.order_id
    WHERE response.l2_id <> order_row.l2_id
  ) THEN
    RAISE EXCEPTION 'universal_order_existing_response_l2_mismatch_requires_live_audit'
      USING ERRCODE = 'P0001';
  END IF;
END
$existing_data_guard$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_l3_max_10_check
  CHECK (cardinality(l3_ids) <= 10);

-- Backfill gives NULL/NULL its established meaning, “Вся Ингушетия”. Existing
-- city-only and district-only rows keep their exact geographic semantics.
UPDATE public.orders
SET location_scope = CASE
  WHEN city_id IS NOT NULL THEN 'city'
  WHEN nullif(btrim(district::text), '') IS NOT NULL THEN 'district'
  ELSE 'region_wide'
END
WHERE location_scope IS NULL;

CREATE OR REPLACE FUNCTION public.normalize_order_location_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.city_id IS NOT NULL
     AND nullif(btrim(NEW.district::text), '') IS NOT NULL THEN
    RAISE EXCEPTION 'order_location_city_and_district_are_mutually_exclusive'
      USING ERRCODE = '23514';
  END IF;

  -- A legacy client does not send location_scope. On UPDATE it also preserves
  -- the old value while changing city/district, so derive again in that case.
  IF NEW.location_scope IS NULL
     OR (
       TG_OP = 'UPDATE'
       AND NEW.location_scope IS NOT DISTINCT FROM OLD.location_scope
       AND (
         NEW.work_mode IS DISTINCT FROM OLD.work_mode
         OR NEW.city_id IS DISTINCT FROM OLD.city_id
         OR NEW.district IS DISTINCT FROM OLD.district
       )
     ) THEN
    NEW.location_scope := CASE
      WHEN NEW.work_mode = 'remote' THEN 'remote'
      WHEN NEW.city_id IS NOT NULL THEN 'city'
      WHEN nullif(btrim(NEW.district::text), '') IS NOT NULL THEN 'district'
      ELSE 'region_wide'
    END;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.normalize_order_location_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_order_location_scope() FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_order_location_scope() FROM authenticated;

DROP TRIGGER IF EXISTS orders_normalize_location_scope ON public.orders;
CREATE TRIGGER orders_normalize_location_scope
BEFORE INSERT OR UPDATE OF work_mode, location_scope, city_id, district
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.normalize_order_location_scope();

ALTER TABLE public.orders
  ALTER COLUMN location_scope SET NOT NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_work_mode_location_check CHECK (
    (
      work_mode = 'remote'
      AND location_scope = 'remote'
      AND city_id IS NULL
      AND district IS NULL
    )
    OR (
      work_mode = 'onsite'
      AND location_scope = 'region_wide'
      AND city_id IS NULL
      AND district IS NULL
    )
    OR (
      work_mode = 'onsite'
      AND location_scope = 'city'
      AND city_id IS NOT NULL
      AND district IS NULL
    )
    OR (
      work_mode = 'onsite'
      AND location_scope = 'district'
      AND city_id IS NULL
      AND nullif(btrim(district::text), '') IS NOT NULL
    )
  );

-- This policy is intentionally restrictive: permissive legacy read policies
-- cannot make moderated content public again. A future moderator bypass must be
-- designed from the audited live admin model, not from the known self-admin
-- candidate in migration history.
DROP POLICY IF EXISTS orders_moderation_visibility_restrictive ON public.orders;
CREATE POLICY orders_moderation_visibility_restrictive ON public.orders
  AS RESTRICTIVE
  FOR SELECT TO anon, authenticated
  USING (
    moderation_status = 'published'
    OR ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = client_id)
  );

CREATE TABLE IF NOT EXISTS public.order_classification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Snapshot identifiers deliberately have no cascading FK: deleting the
  -- mutable order/user must not silently erase audit history. Live retention
  -- and erasure policy still requires explicit legal/operational preflight.
  order_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_role text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 240),
  old_l2_id text NOT NULL,
  new_l2_id text NOT NULL,
  old_l3_ids text[] NOT NULL,
  new_l3_ids text[] NOT NULL,
  old_primary_l3_id text,
  new_primary_l3_id text,
  old_classification_status text NOT NULL,
  new_classification_status text NOT NULL,
  old_classification_source text NOT NULL,
  new_classification_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_classification_audit IS
  'Append-only actor-attributed history for trusted service reclassification. Owners have no table or RPC grant.';

ALTER TABLE public.order_classification_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_classification_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.order_classification_audit TO service_role;

CREATE OR REPLACE FUNCTION public.owner_order_has_responses(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders AS order_row
      JOIN public.order_responses AS response
        ON response.order_id = order_row.id
      WHERE order_row.id = p_order_id
        AND order_row.client_id = auth.uid()
    );
$function$;

COMMENT ON FUNCTION public.owner_order_has_responses(uuid) IS
  'Narrow owner-only consistency guard used to prevent category edits after a response; it discloses nothing about foreign orders.';

REVOKE ALL ON FUNCTION public.owner_order_has_responses(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_order_has_responses(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_universal_order_classification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_distinct_l3_count integer;
  v_service_actor text;
BEGIN
  v_service_actor := nullif(
    current_setting('xtrud.classification_actor_id', true),
    ''
  );

  IF TG_OP = 'INSERT'
     AND current_user = 'authenticated'
     AND auth.uid() = NEW.client_id THEN
    IF NEW.moderation_status <> 'published'
       OR NEW.moderation_reason_code IS NOT NULL
       OR NEW.classification_note IS NOT NULL
       OR NEW.classification_source = 'moderator'
       OR NEW.classification_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'order_owner_cannot_set_service_fields'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND current_user = 'authenticated'
        AND auth.uid() = OLD.client_id THEN
    -- Owners may edit business category choices for current-client
    -- compatibility, but never service-owned state, moderation or audit fields.
    IF NEW.classification_status IS DISTINCT FROM OLD.classification_status
       OR NEW.classification_source IS DISTINCT FROM OLD.classification_source
       OR NEW.classification_note IS DISTINCT FROM OLD.classification_note
       OR NEW.classification_updated_at IS DISTINCT FROM OLD.classification_updated_at
       OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
       OR NEW.moderation_reason_code IS DISTINCT FROM OLD.moderation_reason_code THEN
      RAISE EXCEPTION 'order_owner_cannot_mutate_service_fields'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.l2_id IS DISTINCT FROM OLD.l2_id
       OR NEW.l3_ids IS DISTINCT FROM OLD.l3_ids
       OR NEW.primary_l3_id IS DISTINCT FROM OLD.primary_l3_id THEN
      -- Editing after a response would invalidate the response/order L2
      -- contract. Pending fallback and moderator classifications require a
      -- trusted service transition and cannot be escaped by changing category.
      IF OLD.status <> 'open'
         OR NEW.status <> 'open'
         OR NOT (
           (NEW.classification_status = 'legacy'
             AND NEW.classification_source = 'legacy')
           OR (NEW.classification_status = 'classified'
             AND NEW.classification_source IN (
               'user_category', 'search_suggestion'
             ))
         )
         OR public.owner_order_has_responses(OLD.id) THEN
        RAISE EXCEPTION 'order_owner_category_edit_not_allowed'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NEW.l3_ids IS NULL THEN
    RAISE EXCEPTION 'order_l3_ids_required'
      USING ERRCODE = '23514';
  END IF;

  IF array_position(NEW.l3_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'order_l3_contains_null'
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(NEW.l3_ids) > 10 THEN
    RAISE EXCEPTION 'order_l3_limit_exceeded'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT selected_l3.id)
  INTO v_distinct_l3_count
  FROM unnest(NEW.l3_ids) AS selected_l3(id);

  IF v_distinct_l3_count <> cardinality(NEW.l3_ids) THEN
    RAISE EXCEPTION 'order_l3_contains_duplicates'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.l3_ids) AS selected_l3(id)
    LEFT JOIN public.categories_l3 AS l3 ON l3.id = selected_l3.id
    WHERE l3.id IS NULL
       OR l3.l2_id <> NEW.l2_id
       OR NOT l3.is_active
       OR NOT l3.task_creation_enabled
  ) THEN
    RAISE EXCEPTION 'order_l3_not_in_l2'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.primary_l3_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.categories_l3 AS l3
    WHERE l3.id = NEW.primary_l3_id
      AND l3.l2_id = NEW.l2_id
      AND l3.is_active
      AND l3.task_creation_enabled
  ) THEN
    RAISE EXCEPTION 'order_primary_l3_not_in_l2'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.primary_l3_id IS NOT NULL
     AND NOT (NEW.primary_l3_id = ANY(NEW.l3_ids)) THEN
    RAISE EXCEPTION 'order_primary_l3_not_selected'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.categories_l2 AS l2
    JOIN public.categories_l1 AS l1 ON l1.id = l2.l1_id
    WHERE l2.id = NEW.l2_id
      AND l1.is_active
      AND l1.task_creation_enabled
      AND l2.is_active
      AND l2.task_creation_enabled
  ) THEN
    RAISE EXCEPTION 'order_category_task_creation_disabled'
      USING ERRCODE = '23514';
  END IF;

  -- Exact fail-closed state/source matrix. `legacy` is the compatibility
  -- default, fallback is always pending review, user/search choices are
  -- classified, and moderator is reachable only through the trusted RPC below.
  IF NOT (
    (NEW.classification_status = 'legacy'
      AND NEW.classification_source = 'legacy')
    OR (NEW.classification_status = 'pending'
      AND NEW.classification_source = 'fallback')
    OR (NEW.classification_status = 'classified'
      AND NEW.classification_source IN (
        'user_category', 'search_suggestion', 'moderator'
      ))
  ) THEN
    RAISE EXCEPTION 'order_classification_state_source_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.classification_source = 'moderator' THEN
    IF TG_OP <> 'UPDATE'
       OR current_user <> 'service_role'
       OR v_service_actor IS NULL
       OR v_service_actor !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR nullif(trim(NEW.classification_note), '') IS NULL THEN
      RAISE EXCEPTION 'order_moderator_transition_requires_trusted_actor'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.classification_source = 'moderator'
        AND (
          NEW.l2_id IS DISTINCT FROM OLD.l2_id
          OR NEW.l3_ids IS DISTINCT FROM OLD.l3_ids
          OR NEW.primary_l3_id IS DISTINCT FROM OLD.primary_l3_id
          OR NEW.classification_status IS DISTINCT FROM OLD.classification_status
          OR NEW.classification_source IS DISTINCT FROM OLD.classification_source
        ) THEN
    RAISE EXCEPTION 'order_moderator_classification_is_service_managed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.l2_id = 'other-services' THEN
    IF NEW.classification_status <> 'pending'
       OR NEW.classification_source <> 'fallback'
       OR NEW.requested_service_text IS NULL
       OR NEW.primary_l3_id IS NOT NULL
       OR cardinality(NEW.l3_ids) <> 0 THEN
      RAISE EXCEPTION 'order_fallback_requires_review'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.classification_source = 'fallback' THEN
    RAISE EXCEPTION 'order_fallback_source_requires_fallback_l2'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.requested_service_text IS DISTINCT FROM OLD.requested_service_text THEN
    RAISE EXCEPTION 'order_requested_service_text_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.classification_source <> 'legacy' THEN
    NEW.classification_updated_at := now();
  ELSIF TG_OP = 'UPDATE'
     AND (
       NEW.l2_id IS DISTINCT FROM OLD.l2_id
       OR NEW.l3_ids IS DISTINCT FROM OLD.l3_ids
       OR NEW.primary_l3_id IS DISTINCT FROM OLD.primary_l3_id
       OR NEW.classification_status IS DISTINCT FROM OLD.classification_status
       OR NEW.classification_source IS DISTINCT FROM OLD.classification_source
     ) THEN
    NEW.classification_updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_universal_order_classification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_universal_order_classification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_universal_order_classification() FROM authenticated;

DROP TRIGGER IF EXISTS orders_validate_universal_classification ON public.orders;
CREATE TRIGGER orders_validate_universal_classification
BEFORE INSERT OR UPDATE OF
  l2_id,
  l3_ids,
  primary_l3_id,
  classification_status,
  classification_source,
  classification_note,
  classification_updated_at,
  requested_service_text,
  moderation_status,
  moderation_reason_code
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_universal_order_classification();

CREATE OR REPLACE FUNCTION public.audit_order_service_reclassification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_id uuid;
BEGIN
  IF NEW.classification_source = 'moderator'
     AND (
       NEW.l2_id IS DISTINCT FROM OLD.l2_id
       OR NEW.l3_ids IS DISTINCT FROM OLD.l3_ids
       OR NEW.primary_l3_id IS DISTINCT FROM OLD.primary_l3_id
       OR NEW.classification_status IS DISTINCT FROM OLD.classification_status
       OR NEW.classification_source IS DISTINCT FROM OLD.classification_source
     ) THEN
    IF current_user <> 'service_role' THEN
      RAISE EXCEPTION 'order_classification_audit_requires_service_role'
        USING ERRCODE = '42501';
    END IF;

    v_actor_id := nullif(
      current_setting('xtrud.classification_actor_id', true),
      ''
    )::uuid;

    INSERT INTO public.order_classification_audit (
      order_id,
      actor_id,
      actor_role,
      reason,
      old_l2_id,
      new_l2_id,
      old_l3_ids,
      new_l3_ids,
      old_primary_l3_id,
      new_primary_l3_id,
      old_classification_status,
      new_classification_status,
      old_classification_source,
      new_classification_source
    ) VALUES (
      NEW.id,
      v_actor_id,
      current_user,
      NEW.classification_note,
      OLD.l2_id,
      NEW.l2_id,
      OLD.l3_ids,
      NEW.l3_ids,
      OLD.primary_l3_id,
      NEW.primary_l3_id,
      OLD.classification_status,
      NEW.classification_status,
      OLD.classification_source,
      NEW.classification_source
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.audit_order_service_reclassification()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS orders_audit_service_reclassification ON public.orders;
CREATE TRIGGER orders_audit_service_reclassification
AFTER UPDATE OF
  l2_id,
  l3_ids,
  primary_l3_id,
  classification_status,
  classification_source
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.audit_order_service_reclassification();

CREATE OR REPLACE FUNCTION public.reclassify_order_by_service(
  p_order_id uuid,
  p_actor_id uuid,
  p_l2_id text,
  p_l3_ids text[],
  p_primary_l3_id text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user <> 'service_role'
     OR p_actor_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id)
     OR nullif(trim(p_reason), '') IS NULL
     OR length(p_reason) > 240 THEN
    RAISE EXCEPTION 'order_reclassification_service_preflight_failed'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config(
    'xtrud.classification_actor_id',
    p_actor_id::text,
    true
  );

  UPDATE public.orders
  SET l2_id = p_l2_id,
      l3_ids = p_l3_ids,
      primary_l3_id = p_primary_l3_id,
      classification_status = 'classified',
      classification_source = 'moderator',
      classification_note = p_reason
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_reclassification_target_not_found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.reclassify_order_by_service(uuid, uuid, text, text[], text, text) IS
  'Draft-only trusted service transition with explicit actor and append-only audit. Live service_role ACL/runtime must be reconciled before promotion.';

REVOKE ALL ON FUNCTION public.reclassify_order_by_service(uuid, uuid, text, text[], text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reclassify_order_by_service(uuid, uuid, text, text[], text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.validate_order_response_l2_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_order_l2_id text;
  v_requires_verification boolean;
BEGIN
  SELECT order_row.l2_id, l2.requires_verification
  INTO v_order_l2_id, v_requires_verification
  FROM public.orders AS order_row
  JOIN public.categories_l2 AS l2 ON l2.id = order_row.l2_id
  JOIN public.categories_l1 AS l1 ON l1.id = l2.l1_id
  WHERE order_row.id = NEW.order_id
    AND order_row.status = 'open'
    AND order_row.moderation_status = 'published'
    AND l1.is_active
    AND l1.matching_enabled
    AND l2.is_active
    AND l2.matching_enabled;

  IF v_order_l2_id IS NULL THEN
    RAISE EXCEPTION 'order_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NEW.l2_id <> v_order_l2_id THEN
    RAISE EXCEPTION 'order_response_l2_mismatch'
      USING ERRCODE = '23514';
  END IF;

  -- The repository does not prove the live verification schema. Categories
  -- which require verification therefore reject responses until a promoted
  -- migration can verify the exact master-status source and its ACL/RLS rules.
  IF v_requires_verification THEN
    RAISE EXCEPTION 'order_response_verification_contract_requires_live_audit'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_order_response_l2_consistency() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_order_response_l2_consistency() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_order_response_l2_consistency() FROM authenticated;

DROP TRIGGER IF EXISTS order_responses_validate_l2_consistency ON public.order_responses;
CREATE TRIGGER order_responses_validate_l2_consistency
BEFORE INSERT OR UPDATE OF order_id, l2_id
ON public.order_responses
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_response_l2_consistency();

COMMIT;
