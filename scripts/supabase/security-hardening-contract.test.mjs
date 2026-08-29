import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const draftPath = path.join(root, "supabase/migration-drafts/security_hardening_live_verified.sql");
const productionPath = path.join(root, "supabase/migrations/security_hardening_live_verified.sql");
const draft = readFileSync(draftPath, "utf8");

function has(source, pattern) {
  return pattern.test(source);
}

function section(source, startMarker, endMarker = null) {
  const start = source.indexOf(startMarker);
  if (start === -1) return "";
  if (endMarker === null) return source.slice(start);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end === -1 ? "" : source.slice(start, end);
}

function validateCandidate(source, candidatePath = draftPath) {
  const failures = [];
  const requirePattern = (label, pattern) => {
    if (!has(source, pattern)) failures.push(label);
  };

  if (path.dirname(candidatePath) !== path.join(root, "supabase/migration-drafts")) {
    failures.push("candidate must remain under supabase/migration-drafts");
  }
  if (/^\d{4}[_-]/u.test(path.basename(candidatePath))) {
    failures.push("candidate must not claim a production migration number");
  }

  requirePattern("draft-only warning", /DRAFT ONLY — DO NOT APPLY/u);
  requirePattern("transaction begin", /^BEGIN;$/mu);
  requirePattern("transaction commit", /^COMMIT;$/mu);

  const preflight = section(
    source,
    "DO $security_preflight$",
    "CREATE OR REPLACE FUNCTION public.security_hardening_guard_users_update()",
  );
  const usersGuard = section(
    source,
    "CREATE OR REPLACE FUNCTION public.security_hardening_guard_users_update()",
    "CREATE OR REPLACE FUNCTION public.security_hardening_guard_master_profiles_write()",
  );
  const masterProfilesGuard = section(
    source,
    "CREATE OR REPLACE FUNCTION public.security_hardening_guard_master_profiles_write()",
    "CREATE OR REPLACE FUNCTION public.security_hardening_guard_master_categories_write()",
  );
  const masterCategoriesGuard = section(
    source,
    "CREATE OR REPLACE FUNCTION public.security_hardening_guard_master_categories_write()",
    "-- Remove unused direct client operations",
  );

  if (!preflight || !usersGuard || !masterProfilesGuard || !masterCategoriesGuard) {
    failures.push("security draft sections must remain ordered and complete");
  }

  for (const table of ["users", "master_profiles", "master_categories"]) {
    requirePattern(`required table columns: ${table}`, new RegExp(`\\('${table}',`, "u"));
  }
  for (const policy of [
    "users_update_own",
    "master_profiles_update_own",
    "master_categories_update_own",
  ]) {
    requirePattern(`live broad policy preflight: ${policy}`, new RegExp(`'${policy}'`, "u"));
  }
  requirePattern(
    "broad protected-column grant preflight",
    /has_column_privilege[\s\S]+expected_broad_grants_changed/u,
  );
  requirePattern(
    "schema expansion fails closed before INSERT allowlists",
    /unexpected_columns_require_live_reconciliation/u,
  );

  for (const signature of [
    "public.get_master_phone(uuid)",
    "public.resolve_login_email(text)",
    "public.mark_feed_seen()",
    "public.set_availability(public.availability_status)",
    "public.touch_last_active()",
    "public.set_username(text)",
    "public.set_master_categories(text[])",
    "public.recalc_master_rating()",
  ]) {
    if (!has(preflight, new RegExp(signature.replaceAll(/[()[\].]/gu, "\\$&"), "u"))) {
      failures.push(`required function preflight: ${signature}`);
    }
  }

  requirePattern(
    "trusted definer/service and nested-trigger bypass",
    /current_user NOT IN \('anon', 'authenticated'\) OR pg_trigger_depth\(\) > 1/gu,
  );
  const bypassCount = source.match(
    /current_user NOT IN \('anon', 'authenticated'\) OR pg_trigger_depth\(\) > 1/gu,
  )?.length;
  if (bypassCount !== 3) failures.push("all three guards need the same trusted-path bypass");

  requirePattern(
    "users fail-closed JSON allowlist",
    /security_hardening_guard_users_update[\s\S]+to_jsonb\(NEW\) - v_allowed[\s\S]+users_protected_columns_are_server_managed/u,
  );
  for (const column of [
    "first_name",
    "last_name",
    "avatar_url",
    "city_id",
    "district",
    "contact_phone",
    "active_role",
    "is_master",
    "onboarding_completed_at",
  ]) {
    if (!has(usersGuard, new RegExp(`'${column}'`, "u"))) {
      failures.push(`users owner allowlist: ${column}`);
    }
  }
  if (!has(usersGuard, /v_is_admin[\s\S]+ARRAY\['status'\]/u)) {
    failures.push("admin status-only compatibility");
  }
  if (!has(usersGuard, /is_master_cannot_be_revoked_by_owner/u)) {
    failures.push("owner cannot revoke master flag");
  }
  if (/'(is_admin|is_demo|rating_as_client_avg|rating_as_client_count)'/u.test(usersGuard)) {
    failures.push("users owner allowlist must exclude trust and rating columns");
  }

  requirePattern(
    "master profile fail-closed JSON allowlist",
    /security_hardening_guard_master_profiles_write[\s\S]+to_jsonb\(NEW\) - v_allowed[\s\S]+master_profile_protected_columns_are_server_managed/u,
  );
  for (const protectedAssignment of [
    /NEW\.verification_level := 1/u,
    /NEW\.closed_deals := 0/u,
    /NEW\.rating_overall_avg := NULL/u,
    /NEW\.rating_overall_count := 0/u,
    /NEW\.ranking_score := 0/u,
  ]) {
    if (!has(masterProfilesGuard, protectedAssignment)) {
      failures.push("master profile INSERT trust reset");
    }
  }
  if (
    !has(masterProfilesGuard, /OLD\.status IN \('draft', 'pending'\) AND NEW\.status = 'active'/u)
  ) {
    failures.push("only onboarding publication status transition");
  }

  requirePattern(
    "master category fail-closed JSON allowlist",
    /security_hardening_guard_master_categories_write[\s\S]+to_jsonb\(NEW\) - v_allowed[\s\S]+master_category_identity_and_trust_are_server_managed/u,
  );
  for (const protectedAssignment of [
    /NEW\.rating_avg := NULL/u,
    /NEW\.rating_count := 0/u,
    /NEW\.closed_deals := 0/u,
  ]) {
    if (!has(masterCategoriesGuard, protectedAssignment)) {
      failures.push("master category INSERT trust reset");
    }
  }

  for (const triggerName of [
    "security_hardening_users_update_guard",
    "security_hardening_master_profiles_write_guard",
    "security_hardening_master_categories_write_guard",
  ]) {
    requirePattern(
      `guard trigger: ${triggerName}`,
      new RegExp(`CREATE TRIGGER ${triggerName}`, "u"),
    );
  }

  requirePattern(
    "demo admins are cleared",
    /UPDATE public\.users[\s\S]+SET is_admin = false[\s\S]+WHERE is_demo = true[\s\S]+AND is_admin = true/u,
  );
  requirePattern(
    "demo/admin invariant is durable",
    /CONSTRAINT users_demo_never_admin[\s\S]+CHECK \(NOT \(is_demo AND is_admin\)\)[\s\S]+VALIDATE CONSTRAINT users_demo_never_admin/u,
  );

  requirePattern(
    "mark_feed_seen is a narrow definer RPC",
    /CREATE OR REPLACE FUNCTION public\.mark_feed_seen\(\)[\s\S]+SECURITY DEFINER[\s\S]+v_user_id uuid := auth\.uid\(\)[\s\S]+WHERE id = v_user_id/u,
  );
  requirePattern(
    "mark_feed_seen authenticated/service ACL",
    /GRANT EXECUTE ON FUNCTION public\.mark_feed_seen\(\) TO authenticated, service_role/u,
  );

  requirePattern(
    "get_master_phone revokes PUBLIC and anon",
    /REVOKE ALL ON FUNCTION public\.get_master_phone\(uuid\) FROM PUBLIC;[\s\S]+REVOKE ALL ON FUNCTION public\.get_master_phone\(uuid\) FROM anon;/u,
  );
  requirePattern(
    "get_master_phone authenticated/service ACL",
    /GRANT EXECUTE ON FUNCTION public\.get_master_phone\(uuid\) TO authenticated, service_role/u,
  );
  if (
    /GRANT\s+EXECUTE[\s\S]{0,100}get_master_phone\(uuid\)[\s\S]{0,100}\bTO\s+[^;]*\banon\b/iu.test(
      source,
    )
  ) {
    failures.push("get_master_phone must never be granted to anon");
  }

  requirePattern(
    "resolve_login_email blocker is explicit",
    /BLOCKER\(resolve_login_email_anon_enumeration\)/u,
  );
  requirePattern(
    "resolve_login_email removes implicit PUBLIC",
    /REVOKE ALL ON FUNCTION public\.resolve_login_email\(text\) FROM PUBLIC/u,
  );
  requirePattern(
    "resolve_login_email temporarily preserves explicit anon",
    /GRANT EXECUTE ON FUNCTION public\.resolve_login_email\(text\)[\s\S]+TO anon, authenticated, service_role/u,
  );
  if (
    /REVOKE ALL ON FUNCTION public\.resolve_login_email\(text\) FROM (anon|authenticated)/u.test(
      source,
    )
  ) {
    failures.push(
      "resolve_login_email may revoke only implicit PUBLIC in this compatibility phase",
    );
  }

  return failures;
}

test("candidate remains draft-only and is absent from the production migration chain", () => {
  assert.equal(existsSync(draftPath), true);
  assert.equal(existsSync(productionPath), false);
  assert.equal(validateCandidate(draft).length, 0);
});

test("contract rejects removal of trusted nested-trigger handling", () => {
  const mutated = draft.replaceAll(" OR pg_trigger_depth() > 1", "");
  assert.match(validateCandidate(mutated).join("\n"), /trusted-path bypass|nested-trigger/iu);
});

test("contract rejects reopening anonymous master phone lookup", () => {
  const mutated = draft.replace(
    "TO authenticated, service_role;\n\n-- BLOCKER(resolve_login_email_anon_enumeration)",
    "TO anon, authenticated, service_role;\n\n-- BLOCKER(resolve_login_email_anon_enumeration)",
  );
  assert.match(validateCandidate(mutated).join("\n"), /get_master_phone/iu);
});

test("contract rejects removal of a server-managed ranking reset", () => {
  const mutated = draft.replace("    NEW.ranking_score := 0;\n", "");
  assert.match(validateCandidate(mutated).join("\n"), /INSERT trust reset/iu);
});

test("contract rejects loss of the demo-admin invariant", () => {
  const mutated = draft.replace("  CHECK (NOT (is_demo AND is_admin))\n", "  CHECK (true)\n");
  assert.match(validateCandidate(mutated).join("\n"), /demo\/admin invariant/iu);
});

test("contract rejects silently removing the pre-login enumeration blocker", () => {
  const mutated = draft.replace("BLOCKER(resolve_login_email_anon_enumeration)", "resolved");
  assert.match(validateCandidate(mutated).join("\n"), /blocker/iu);
});

test("contract rejects a candidate placed in the production directory", () => {
  const fakeProductionPath = path.join(
    root,
    "supabase/migrations/security_hardening_live_verified.sql",
  );
  assert.match(validateCandidate(draft, fakeProductionPath).join("\n"), /migration-drafts/iu);
});
