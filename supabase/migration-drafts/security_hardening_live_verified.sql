-- DRAFT ONLY — DO NOT APPLY, RENAME AS A PRODUCTION MIGRATION, OR COPY INTO
-- supabase/migrations/. Promotion requires the live read-only snapshot,
-- encrypted backup, restored-snapshot rehearsal, PostgREST/RLS role matrix and
-- a newly numbered forward-only migration. See migration-drafts/README.md.
--
-- Candidate based on the 2026-08 live audit:
--   * users/master_profiles/master_categories have broad owner-write policies;
--   * anon/authenticated/service_role have broad column grants;
--   * one demo account is also an administrator;
--   * get_master_phone is already authenticated/service_role-only live;
--   * resolve_login_email is still intentionally callable before login.
--
-- The preflight deliberately recognizes only that audited CURRENT state. If a
-- policy, column, function security mode, ACL or trusted trigger differs, the
-- transaction aborts before any DDL or data change.

BEGIN;

DO $security_preflight$
DECLARE
  v_missing text;
  v_policy record;
  v_using text;
  v_check text;
  v_security_definer boolean;
  v_owner text;
  v_public_execute boolean;
BEGIN
  IF current_setting('server_version_num')::int < 140000 THEN
    RAISE EXCEPTION 'security_hardening_requires_postgresql_14_or_newer'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO v_missing
  FROM (
    VALUES
      ('users', 'id'),
      ('users', 'first_name'),
      ('users', 'last_name'),
      ('users', 'avatar_url'),
      ('users', 'city_id'),
      ('users', 'district'),
      ('users', 'contact_phone'),
      ('users', 'is_client'),
      ('users', 'is_master'),
      ('users', 'is_admin'),
      ('users', 'is_demo'),
      ('users', 'active_role'),
      ('users', 'onboarding_completed_at'),
      ('users', 'username'),
      ('users', 'last_active_at'),
      ('users', 'last_seen_feed_at'),
      ('users', 'rating_as_client_avg'),
      ('users', 'rating_as_client_count'),
      ('users', 'status'),
      ('users', 'created_at'),
      ('users', 'updated_at'),
      ('master_profiles', 'user_id'),
      ('master_profiles', 'bio'),
      ('master_profiles', 'status'),
      ('master_profiles', 'verification_level'),
      ('master_profiles', 'closed_deals'),
      ('master_profiles', 'rating_overall_avg'),
      ('master_profiles', 'rating_overall_count'),
      ('master_profiles', 'ranking_score'),
      ('master_profiles', 'experience_years'),
      ('master_profiles', 'has_tools'),
      ('master_profiles', 'has_transport'),
      ('master_profiles', 'work_schedule'),
      ('master_profiles', 'languages'),
      ('master_profiles', 'tax_status'),
      ('master_profiles', 'inn'),
      ('master_profiles', 'team_size'),
      ('master_profiles', 'home_clients_policy'),
      ('master_profiles', 'account_type'),
      ('master_profiles', 'legal_name'),
      ('master_profiles', 'ogrn'),
      ('master_profiles', 'availability_status'),
      ('master_profiles', 'availability_until'),
      ('master_profiles', 'whatsapp_phone'),
      ('master_profiles', 'whatsapp_same_as_phone'),
      ('master_profiles', 'is_hidden_from_search'),
      ('master_profiles', 'created_at'),
      ('master_profiles', 'updated_at'),
      ('master_categories', 'id'),
      ('master_categories', 'master_id'),
      ('master_categories', 'l2_id'),
      ('master_categories', 'l3_ids'),
      ('master_categories', 'pricing_mode'),
      ('master_categories', 'pricing'),
      ('master_categories', 'attributes'),
      ('master_categories', 'category_bio'),
      ('master_categories', 'rating_avg'),
      ('master_categories', 'rating_count'),
      ('master_categories', 'closed_deals'),
      ('master_categories', 'created_at'),
      ('master_categories', 'updated_at')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name = required.table_name
      AND column_row.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'security_hardening_required_columns_missing: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- Missing-column checks alone are not enough for INSERT allowlists: a future
  -- server-managed column could otherwise be supplied explicitly by a client.
  -- Exact counts make schema expansion fail closed until the new column is
  -- classified as owner-controlled or server-managed in a reviewed successor.
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users') <> 21
     OR (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'master_profiles') <> 27
     OR (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'master_categories') <> 13 THEN
    RAISE EXCEPTION 'security_hardening_unexpected_columns_require_live_reconciliation'
      USING ERRCODE = 'P0001';
  END IF;

  -- INSERT guards below normalize server-managed values to these audited live
  -- defaults. Abort instead of guessing if the restored live snapshot differs.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_profiles'
      AND column_name = 'status'
      AND column_default ~* 'draft'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_profiles'
      AND column_name = 'verification_level'
      AND regexp_replace(column_default, '[^0-9-]', '', 'g') = '1'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_profiles'
      AND column_name = 'availability_status'
      AND column_default ~* 'unspecified'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_profiles'
      AND column_name = 'ranking_score'
      AND regexp_replace(column_default, '[^0-9-]', '', 'g') = '0'
  ) THEN
    RAISE EXCEPTION 'security_hardening_master_profile_defaults_require_live_reconciliation'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(signature, ', ')
  INTO v_missing
  FROM unnest(ARRAY[
    'public.is_current_user_admin()',
    'public.get_master_phone(uuid)',
    'public.resolve_login_email(text)',
    'public.mark_feed_seen()',
    'public.set_availability(public.availability_status)',
    'public.touch_last_active()',
    'public.set_username(text)',
    'public.set_master_categories(text[])',
    'public.finalize_master_onboarding()',
    'public.recalc_master_rating()'
  ]::text[]) AS required(signature)
  WHERE to_regprocedure(signature) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'security_hardening_required_functions_missing: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- The three audited policies must still be the permissive PUBLIC owner-only
  -- policies. This intentionally rejects renamed, restrictive or compound
  -- replacements; such drift needs a fresh read-only review.
  FOR v_policy IN
    SELECT *
    FROM (VALUES
      ('users', 'users_update_own', 'id'),
      ('master_profiles', 'master_profiles_update_own', 'user_id'),
      ('master_categories', 'master_categories_update_own', 'master_id')
    ) AS expected(table_name, policy_name, identity_column)
  LOOP
    SELECT
      lower(pg_get_expr(policy_row.polqual, policy_row.polrelid)),
      lower(pg_get_expr(policy_row.polwithcheck, policy_row.polrelid))
    INTO v_using, v_check
    FROM pg_policy AS policy_row
    JOIN pg_class AS table_row ON table_row.oid = policy_row.polrelid
    JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = v_policy.table_name
      AND policy_row.polname = v_policy.policy_name
      AND policy_row.polcmd = 'w'
      AND policy_row.polpermissive = true
      AND policy_row.polroles = ARRAY[0::oid];

    IF NOT FOUND
       OR v_using IS NULL
       OR v_check IS NULL
       OR position('auth.uid' IN v_using) = 0
       OR v_using !~ ('\\m' || v_policy.identity_column || '\\M')
       OR position('auth.uid' IN v_check) = 0
       OR v_check !~ ('\\m' || v_policy.identity_column || '\\M')
       OR v_using ~ '\m(and|or)\M|is_admin|status|rating|verification'
       OR v_check ~ '\m(and|or)\M|is_admin|status|rating|verification' THEN
      RAISE EXCEPTION 'security_hardening_policy_requires_live_reconciliation: %.%',
        v_policy.table_name, v_policy.policy_name
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Live evidence says all API roles can address protected columns. Verify a
  -- representative protected field for every role/table before relying on the
  -- guards as the compatibility layer over existing grants.
  SELECT string_agg(
    format('%I %I.%I %s', probe.role_name, probe.table_name, probe.column_name, probe.privilege_name),
    ', '
  )
  INTO v_missing
  FROM (
    VALUES
      ('anon', 'users', 'is_admin', 'UPDATE'),
      ('authenticated', 'users', 'is_admin', 'UPDATE'),
      ('service_role', 'users', 'is_admin', 'UPDATE'),
      ('anon', 'master_profiles', 'ranking_score', 'UPDATE'),
      ('authenticated', 'master_profiles', 'ranking_score', 'UPDATE'),
      ('service_role', 'master_profiles', 'ranking_score', 'UPDATE'),
      ('anon', 'master_categories', 'closed_deals', 'UPDATE'),
      ('authenticated', 'master_categories', 'closed_deals', 'UPDATE'),
      ('service_role', 'master_categories', 'closed_deals', 'UPDATE')
  ) AS probe(role_name, table_name, column_name, privilege_name)
  WHERE NOT has_column_privilege(
    probe.role_name,
    format('public.%I', probe.table_name),
    probe.column_name,
    probe.privilege_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'security_hardening_expected_broad_grants_changed: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  -- Trusted RPCs currently rely on SECURITY DEFINER to update server-managed
  -- columns through the guards. mark_feed_seen is the one audited invoker-mode
  -- RPC that this candidate deliberately replaces below.
  FOR v_policy IN
    SELECT *
    FROM (VALUES
      ('public.get_master_phone(uuid)', true),
      ('public.resolve_login_email(text)', true),
      ('public.mark_feed_seen()', false),
      ('public.set_availability(public.availability_status)', true),
      ('public.touch_last_active()', true),
      ('public.set_username(text)', true)
    ) AS expected(signature, expected_security_definer)
  LOOP
    SELECT function_row.prosecdef, owner_role.rolname
    INTO v_security_definer, v_owner
    FROM pg_proc AS function_row
    JOIN pg_roles AS owner_role ON owner_role.oid = function_row.proowner
    WHERE function_row.oid = to_regprocedure(v_policy.signature);

    IF v_security_definer IS DISTINCT FROM v_policy.expected_security_definer
       OR v_owner IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
      RAISE EXCEPTION 'security_hardening_function_mode_requires_live_reconciliation: %',
        v_policy.signature
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'reviews'
      AND trigger_row.tgname = 'reviews_recalc_master_rating'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'security_hardening_trusted_rating_trigger_missing'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname IN (
      'security_hardening_users_update_guard',
      'security_hardening_master_profiles_write_guard',
      'security_hardening_master_categories_write_guard'
    )
      AND NOT tgisinternal
  ) OR to_regprocedure('public.security_hardening_guard_users_update()') IS NOT NULL
    OR to_regprocedure('public.security_hardening_guard_master_profiles_write()') IS NOT NULL
    OR to_regprocedure('public.security_hardening_guard_master_categories_write()') IS NOT NULL
    OR EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_demo_never_admin'
  ) THEN
    RAISE EXCEPTION 'security_hardening_candidate_objects_already_exist'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc AS function_row,
         LATERAL aclexplode(COALESCE(
           function_row.proacl,
           acldefault('f', function_row.proowner)
         )) AS acl_row
    WHERE function_row.oid = to_regprocedure('public.resolve_login_email(text)')
      AND acl_row.grantee = 0
      AND acl_row.privilege_type = 'EXECUTE'
  ) INTO v_public_execute;

  IF NOT v_public_execute
     OR NOT has_function_privilege('anon', 'public.resolve_login_email(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.resolve_login_email(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_master_phone(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_master_phone(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_master_phone(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'security_hardening_function_acl_requires_live_reconciliation'
      USING ERRCODE = 'P0001';
  END IF;
END
$security_preflight$;

CREATE OR REPLACE FUNCTION public.security_hardening_guard_users_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $guard$
DECLARE
  v_allowed text[] := ARRAY['updated_at'];
  v_is_self boolean := OLD.id = auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- SECURITY DEFINER RPC/service_role/postgres paths keep their narrow server
  -- contracts. Depth > 1 preserves trusted review/rating triggers; normal
  -- PostgREST writes enter this trigger at depth 1 and are checked.
  IF current_user NOT IN ('anon', 'authenticated') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF current_user = 'anon' THEN
    RAISE EXCEPTION 'users_write_requires_authentication' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_current_user_admin();

  IF v_is_self THEN
    v_allowed := v_allowed || ARRAY[
      'first_name',
      'last_name',
      'avatar_url',
      'city_id',
      'district',
      'contact_phone',
      'active_role',
      'is_master',
      'onboarding_completed_at'
    ];

    IF OLD.is_master AND NOT NEW.is_master THEN
      RAISE EXCEPTION 'is_master_cannot_be_revoked_by_owner' USING ERRCODE = '42501';
    END IF;

    IF NEW.active_role = 'master' AND NOT NEW.is_master THEN
      RAISE EXCEPTION 'master_role_requires_master_flag' USING ERRCODE = '23514';
    END IF;

    -- Preserve idempotent client retries while making the first completion
    -- timestamp server-authored and immutable thereafter.
    IF OLD.onboarding_completed_at IS NOT NULL THEN
      NEW.onboarding_completed_at := OLD.onboarding_completed_at;
    ELSIF NEW.onboarding_completed_at IS NOT NULL THEN
      NEW.onboarding_completed_at := now();
    END IF;
  END IF;

  IF v_is_admin THEN
    -- Current admin UI changes only status. Admins may not use the broad admin
    -- RLS policy to edit identity, ratings or trust fields of another user.
    v_allowed := v_allowed || ARRAY['status'];
  END IF;

  IF NOT v_is_self AND NOT v_is_admin THEN
    RAISE EXCEPTION 'users_update_not_owner_or_admin' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();

  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'users_protected_columns_are_server_managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION public.security_hardening_guard_users_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_hardening_guard_users_update() FROM anon;
REVOKE ALL ON FUNCTION public.security_hardening_guard_users_update() FROM authenticated;

CREATE TRIGGER security_hardening_users_update_guard
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.security_hardening_guard_users_update();

CREATE OR REPLACE FUNCTION public.security_hardening_guard_master_profiles_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $guard$
DECLARE
  v_allowed text[] := ARRAY[
    'bio',
    'experience_years',
    'has_tools',
    'has_transport',
    'whatsapp_same_as_phone',
    'whatsapp_phone',
    'is_hidden_from_search',
    'updated_at'
  ];
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF current_user = 'anon' OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'master_profile_write_requires_owner' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Only the fields explicitly sent by the current onboarding UPSERT survive.
    -- Trust, ranking and inactive future business fields are server-authored.
    NEW.status := 'draft';
    NEW.verification_level := 1;
    NEW.closed_deals := 0;
    NEW.rating_overall_avg := NULL;
    NEW.rating_overall_count := 0;
    NEW.ranking_score := 0;
    NEW.availability_status := 'unspecified';
    NEW.availability_until := NULL;
    NEW.account_type := 'solo';
    NEW.legal_name := NULL;
    NEW.ogrn := NULL;
    NEW.tax_status := NULL;
    NEW.inn := NULL;
    NEW.team_size := 1;
    NEW.languages := ARRAY['ru']::text[];
    NEW.work_schedule := '{}'::jsonb;
    NEW.home_clients_policy := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'master_profile_update_requires_owner' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Compatibility bridge for the current final onboarding step. It prevents
    -- self-unsuspend/self-unarchive and every other owner status transition.
    IF OLD.status IN ('draft', 'pending') AND NEW.status = 'active' THEN
      v_allowed := v_allowed || ARRAY['status'];
    ELSE
      RAISE EXCEPTION 'master_profile_status_transition_is_server_managed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();

  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'master_profile_protected_columns_are_server_managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION public.security_hardening_guard_master_profiles_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_hardening_guard_master_profiles_write() FROM anon;
REVOKE ALL ON FUNCTION public.security_hardening_guard_master_profiles_write() FROM authenticated;

CREATE TRIGGER security_hardening_master_profiles_write_guard
BEFORE INSERT OR UPDATE ON public.master_profiles
FOR EACH ROW
EXECUTE FUNCTION public.security_hardening_guard_master_profiles_write();

CREATE OR REPLACE FUNCTION public.security_hardening_guard_master_categories_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $guard$
DECLARE
  v_allowed text[] := ARRAY[
    'l3_ids',
    'pricing_mode',
    'pricing',
    'attributes',
    'category_bio',
    'updated_at'
  ];
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF current_user = 'anon' OR NEW.master_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'master_category_write_requires_owner' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- set_master_categories SECURITY INVOKER supplies master_id+l2_id. Direct
    -- owner inserts may additionally supply safe business fields, never trust.
    NEW.id := gen_random_uuid();
    NEW.rating_avg := NULL;
    NEW.rating_count := 0;
    NEW.closed_deals := 0;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF OLD.master_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'master_category_update_requires_owner' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();

  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'master_category_identity_and_trust_are_server_managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION public.security_hardening_guard_master_categories_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_hardening_guard_master_categories_write() FROM anon;
REVOKE ALL ON FUNCTION public.security_hardening_guard_master_categories_write() FROM authenticated;

CREATE TRIGGER security_hardening_master_categories_write_guard
BEFORE INSERT OR UPDATE ON public.master_categories
FOR EACH ROW
EXECUTE FUNCTION public.security_hardening_guard_master_categories_write();

-- Remove unused direct client operations without breaking the current app:
-- auth-user creation is a SECURITY DEFINER trigger, profile deletion cascades,
-- and set_master_categories still needs authenticated INSERT+DELETE.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.master_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.master_categories FROM anon;
REVOKE INSERT, DELETE ON TABLE public.users FROM authenticated;
REVOKE DELETE ON TABLE public.master_profiles FROM authenticated;

-- The live audit found one demo-admin. Remove it and make the invariant durable
-- so a future seed or service_role path cannot recreate the conflict.
UPDATE public.users
SET is_admin = false
WHERE is_demo = true
  AND is_admin = true;

ALTER TABLE public.users
  ADD CONSTRAINT users_demo_never_admin
  CHECK (NOT (is_demo AND is_admin))
  NOT VALID;

ALTER TABLE public.users VALIDATE CONSTRAINT users_demo_never_admin;

-- mark_feed_seen is the only audited invoker RPC that needs a server-managed
-- users column. A narrow definer body plus fixed auth.uid() target lets the
-- users guard protect direct writes without breaking the unread badge.
CREATE OR REPLACE FUNCTION public.mark_feed_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.users
  SET last_seen_feed_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.mark_feed_seen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_feed_seen() FROM anon;
REVOKE ALL ON FUNCTION public.mark_feed_seen() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_feed_seen() TO authenticated, service_role;

-- Reassert the safer live ACL. The historical migration chain still grants
-- anon, so this statement is required for reproducible restore/cutover.
REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_master_phone(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_master_phone(uuid) TO authenticated, service_role;

-- BLOCKER(resolve_login_email_anon_enumeration): phone/password login resolves
-- the email before a session exists (src/lib/auth.ts). Remove only the implicit
-- PUBLIC grant now. Explicit anon EXECUTE must remain until a rate-limited,
-- non-enumerating auth endpoint and compatible iOS release replace this RPC.
REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text)
  TO anon, authenticated, service_role;

COMMIT;
