import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Static fixture for the universal-board migration drafts.
 *
 * Production application is deliberately gated on a live snapshot/backup, so
 * this test does not pretend to execute against the unknown live schema. It
 * proves the deterministic repository contract: canonical IDs, additive
 * defaults, trigger guards, stable cursors, blocking and immutable history.
 */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");

const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const taxonomyMigration = read(
  "supabase/migration-drafts/0120_restore_universal_service_taxonomy.sql",
);
const orderMigration = read("supabase/migration-drafts/0121_universal_order_contract.sql");
const blockingMigration = read("supabase/migration-drafts/0122_user_blocking_contract.sql");
const promotionGate = read("scripts/supabase/universal-promotion-gate.sql");
const canonicalSeed = read("supabase/seed/categories.sql");

const USER_L1_IDS = [
  "construction",
  "home-services",
  "auto",
  "transport",
  "beauty-health",
  "education",
  "events",
  "business",
  "it-digital",
  "personal-services",
];

const REMOVED_L1_IDS = new Set(USER_L1_IDS.slice(2));

function tupleLines(source) {
  return source
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => /^\('[^']+',\s*'[^']+'/.test(line));
}

function tupleIdentity(line) {
  const match = line.match(/^\('([^']+)',\s*'([^']+)'/);
  assert.ok(match, `cannot parse tuple identity: ${line}`);
  return { id: match[1], parentOrName: match[2] };
}

function expectTuple(source, values) {
  const escapedValues = values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  assert.match(source, new RegExp(`\\('${escapedValues.join("'\\s*,\\s*'")}'`));
}

test("taxonomy restores ten canonical user L1 IDs plus one internal fallback", () => {
  assert.equal(new Set(USER_L1_IDS).size, 10);
  for (const id of USER_L1_IDS) {
    assert.match(canonicalSeed, new RegExp(`\\('${id}'\\s*,`));
    assert.match(taxonomyMigration, new RegExp(`'${id}'`));
  }

  expectTuple(taxonomyMigration, ["xtrud-internal", "Системные категории", "Shapes"]);
  expectTuple(taxonomyMigration, ["other-services", "xtrud-internal", "Другая услуга"]);
  expectTuple(taxonomyMigration, ["other-service", "other-services", "Услуга не определена"]);
  assert.match(taxonomyMigration, /v_user_l1_count <> 10/);
  assert.match(
    taxonomyMigration,
    /AND NOT l1\.is_active AND NOT l2\.is_active AND NOT l3\.is_active/,
  );
});

test("tractor and legal services keep stable canonical IDs and parents", () => {
  for (const source of [canonicalSeed, taxonomyMigration]) {
    expectTuple(source, ["heavy-equipment", "transport", "Спецтехника"]);
    expectTuple(source, ["bulldozer", "heavy-equipment", "Бульдозер / трактор"]);
    expectTuple(source, ["legal", "business", "Юридические услуги"]);
    expectTuple(source, ["legal-consult", "legal", "Консультация юриста"]);
  }
  assert.doesNotMatch(taxonomyMigration, /UPDATE\s+public\.categories_l[123]\s+SET\s+id\s*=/i);
  assert.doesNotMatch(taxonomyMigration, /ON CONFLICT\s*\(id\)\s*DO UPDATE/i);
  assert.match(taxonomyMigration, /guard_universal_l1_conflict/);
  assert.match(taxonomyMigration, /guard_universal_l2_conflict/);
  assert.match(taxonomyMigration, /guard_universal_l3_conflict/);
  assert.match(taxonomyMigration, /v_existing\.l1_id IS DISTINCT FROM NEW\.l1_id/);
  assert.match(taxonomyMigration, /v_existing\.l2_id IS DISTINCT FROM NEW\.l2_id/);
});

test("YouDo catalogue gaps are prepared but remain feature-off and search-hidden", () => {
  for (const [id, parentId] of [
    ["event-staff", "events"],
    ["audio-production", "events"],
    ["virtual-assistant", "business"],
    ["device-repair", "it-digital"],
  ]) {
    assert.match(taxonomyMigration, new RegExp(`\\('${id}'\\s*,\\s*'${parentId}'`));
  }

  for (const id of [
    "courier-purchase",
    "promoter",
    "audio-editing",
    "data-entry",
    "phone-repair",
  ]) {
    assert.match(taxonomyMigration, new RegExp(`\\('${id}'\\s*,`));
  }

  assert.match(taxonomyMigration, /WHERE id IN \([^;]*'virtual-assistant'[^;]*'device-repair'/s);
  assert.match(taxonomyMigration, /WHERE l2_id IN \([^;]*'event-staff'[^;]*'audio-production'/s);
  assert.doesNotMatch(
    taxonomyMigration,
    /INSERT INTO public\.category_terms[\s\S]*'virtual-assistant'/,
  );
  assert.doesNotMatch(
    taxonomyMigration,
    /INSERT INTO public\.category_terms[\s\S]*'device-repair'/,
  );
  assert.match(taxonomyMigration, /Search aliases are deliberately NOT inserted/);
  assert.match(taxonomyMigration, /current public\.search_categories synonym branch/);
  assert.match(taxonomyMigration, /\('promoter'[^\n]*NULL/);
  assert.match(taxonomyMigration, /\('phone-repair'[^\n]*NULL/);
});

test("all eight removed branches are restored from the canonical seed", () => {
  const removedL1 = [
    "auto",
    "transport",
    "beauty-health",
    "education",
    "events",
    "business",
    "it-digital",
    "personal-services",
  ];
  for (const id of removedL1) assert.match(taxonomyMigration, new RegExp(`\\('${id}'\\s*,`));

  const l2TupleCount = (
    taxonomyMigration.match(/^\s*\('[^']+',\s*'[^']+',.*(?:true|false)\),?$/gm) ?? []
  ).length;
  assert.ok(l2TupleCount >= 47, `expected at least 47 restored L2 tuples, got ${l2TupleCount}`);
  assert.match(taxonomyMigration, /requires_verification = requires_license/);
  assert.match(taxonomyMigration, /universal_taxonomy_restore_must_remain_feature_off/);
});

test("restore is fail-closed and no 0120-0122 migration activates universal public rollout", () => {
  for (const draft of [taxonomyMigration, orderMigration, blockingMigration]) {
    assert.match(draft, /DRAFT ONLY — DO NOT APPLY TO PRODUCTION/);
  }
  assert.match(
    taxonomyMigration,
    /UPDATE public\.categories_l1\s+SET is_active = false,[\s\S]*task_creation_enabled = false,[\s\S]*WHERE id IN \('auto'/,
  );
  assert.match(
    taxonomyMigration,
    /UPDATE public\.categories_l2\s+SET is_visible = false,[\s\S]*task_creation_enabled = false,[\s\S]*WHERE id IN \('auto-service'/,
  );
  assert.match(
    taxonomyMigration,
    /UPDATE public\.categories_l3\s+SET is_active = false,[\s\S]*task_creation_enabled = false,[\s\S]*WHERE l2_id IN \('auto-service'/,
  );
  assert.match(taxonomyMigration, /universal_taxonomy_current_scope_flags_changed/);
  assert.match(
    taxonomyMigration,
    /ADD COLUMN IF NOT EXISTS task_creation_enabled boolean NOT NULL DEFAULT false/,
  );
  assert.match(taxonomyMigration, /SET is_active = false,[\s\S]*WHERE id IN \('auto'/);
  assert.match(
    taxonomyMigration,
    /SET is_visible = false,[\s\S]*is_active = false,[\s\S]*WHERE id IN \('auto-service'/,
  );
  assert.match(
    taxonomyMigration,
    /UPDATE public\.categories_l1[\s\S]*SET task_creation_enabled = true,[\s\S]*WHERE id IN \('construction', 'home-services'\)/,
  );
});

test("unverified SQL is isolated from the runnable migration chain", () => {
  assert.throws(() => read("supabase/migrations/0120_restore_universal_service_taxonomy.sql"));
  assert.throws(() => read("supabase/migrations/0121_universal_order_contract.sql"));
  assert.throws(() => read("supabase/migrations/0122_user_blocking_contract.sql"));
  assert.match(read("supabase/migration-drafts/README.md"), /not\s+part of the runnable/i);
});

test("all 8 L1, 47 L2 and 179 L3 canonical tuples are copied byte-for-value", () => {
  const seedLines = tupleLines(canonicalSeed);
  const migrationLines = new Set(tupleLines(taxonomyMigration));

  let section = "";
  const removedL2Ids = new Set();
  const expected = { l1: [], l2: [], l3: [] };
  for (const rawLine of canonicalSeed.split("\n")) {
    if (rawLine.includes("INSERT INTO public.categories_l1")) section = "l1";
    if (rawLine.includes("INSERT INTO public.categories_l2")) section = "l2";
    if (rawLine.includes("INSERT INTO public.categories_l3")) section = "l3";

    const normalizedLine = rawLine.trim().replace(/,$/, "");
    if (!seedLines.includes(normalizedLine)) continue;
    const { id, parentOrName } = tupleIdentity(normalizedLine);

    if (section === "l1" && REMOVED_L1_IDS.has(id)) expected.l1.push(normalizedLine);
    if (section === "l2" && REMOVED_L1_IDS.has(parentOrName)) {
      expected.l2.push(normalizedLine);
      removedL2Ids.add(id);
    }
    if (section === "l3" && removedL2Ids.has(parentOrName)) expected.l3.push(normalizedLine);
  }

  assert.deepEqual(
    { l1: expected.l1.length, l2: expected.l2.length, l3: expected.l3.length },
    { l1: 8, l2: 47, l3: 179 },
  );
  for (const line of [...expected.l1, ...expected.l2, ...expected.l3]) {
    assert.ok(migrationLines.has(line), `canonical tuple missing or changed: ${line}`);
  }
});

test("legacy order inserts remain compatible through defaults and derived location scope", () => {
  assert.match(orderMigration, /l2_id'[\s\S]*is_nullable = 'NO'/);
  assert.match(orderMigration, /classification_status text NOT NULL DEFAULT 'legacy'/);
  assert.match(orderMigration, /classification_source text NOT NULL DEFAULT 'legacy'/);
  assert.match(orderMigration, /moderation_status text NOT NULL DEFAULT 'published'/);
  assert.match(orderMigration, /work_mode text NOT NULL DEFAULT 'onsite'/);
  assert.match(
    orderMigration,
    /location_scope text[\s\S]*'region_wide', 'city', 'district', 'remote'/,
  );
  assert.match(orderMigration, /CREATE OR REPLACE FUNCTION public\.normalize_order_location_scope/);
  assert.match(orderMigration, /ELSE 'region_wide'/);
  assert.match(orderMigration, /ALTER COLUMN location_scope SET NOT NULL/);
  assert.match(orderMigration, /requested_service_text text/);
  assert.match(orderMigration, /publish_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid\(\)/);
  assert.doesNotMatch(orderMigration, /ALTER\s+COLUMN\s+l2_id\s+DROP\s+NOT\s+NULL/i);
  assert.doesNotMatch(orderMigration, /CREATE\s+TABLE\s+public\.(?:tasks|universal_tasks)/i);
});

test("classification, response consistency, idempotency and tuple cursor are enforced", () => {
  assert.match(orderMigration, /cardinality\(NEW\.l3_ids\) > 10/);
  assert.match(orderMigration, /order_l3_limit_exceeded/);
  assert.match(
    orderMigration,
    /ADD CONSTRAINT orders_l3_max_10_check[\s\S]*cardinality\(l3_ids\) <= 10/,
  );
  assert.match(orderMigration, /existing_l3_limit_requires_live_reconciliation/);
  assert.match(orderMigration, /order_l3_not_in_l2/);
  assert.match(orderMigration, /order_primary_l3_not_selected/);
  assert.match(orderMigration, /order_fallback_requires_review/);
  assert.match(orderMigration, /order_response_l2_mismatch/);
  assert.match(orderMigration, /order_requested_service_text_immutable/);
  assert.match(orderMigration, /order_fallback_source_requires_fallback_l2/);
  assert.match(
    orderMigration,
    /work_mode = 'remote'[\s\S]*location_scope = 'remote'[\s\S]*city_id IS NULL[\s\S]*district IS NULL/,
  );
  assert.match(
    orderMigration,
    /work_mode = 'onsite'[\s\S]*location_scope = 'region_wide'[\s\S]*city_id IS NULL[\s\S]*district IS NULL/,
  );
  assert.match(orderMigration, /location_scope = 'city'[\s\S]*city_id IS NOT NULL/);
  assert.match(orderMigration, /location_scope = 'district'[\s\S]*district::text/);
  assert.doesNotMatch(orderMigration, /order_classified_requires_primary_l3/);
  assert.doesNotMatch(orderMigration, /classification_source = 'user'[\s\S]*moderation_status/);
  assert.match(orderMigration, /UNIQUE INDEX[\s\S]*client_id, publish_idempotency_key/i);
  assert.match(orderMigration, /created_at DESC, id DESC/);
  assert.match(orderMigration, /existing_l3_mismatch_requires_live_audit/);
  assert.match(orderMigration, /existing_response_l2_mismatch_requires_live_audit/);
  assert.match(orderMigration, /orders_moderation_visibility_restrictive/);
  assert.match(orderMigration, /moderation_status = 'published'/);
  assert.match(orderMigration, /order_owner_cannot_set_service_fields/);
  assert.match(orderMigration, /order_owner_cannot_mutate_service_fields/);
  assert.match(orderMigration, /order_owner_category_edit_not_allowed/);
  assert.match(
    orderMigration,
    /classification_status = 'legacy'[\s\S]*classification_source = 'legacy'[\s\S]*classification_status = 'classified'[\s\S]*'user_category', 'search_suggestion'/,
  );
  assert.match(orderMigration, /public\.owner_order_has_responses\(OLD\.id\)/);
  assert.match(
    orderMigration,
    /CREATE OR REPLACE FUNCTION public\.owner_order_has_responses[\s\S]*SECURITY DEFINER[\s\S]*order_row\.client_id = auth\.uid\(\)/,
  );
  assert.match(orderMigration, /order_response_verification_contract_requires_live_audit/);
  assert.match(orderMigration, /l1\.matching_enabled/);
  assert.match(orderMigration, /l2\.matching_enabled/);
  assert.match(orderMigration, /order_classification_state_source_invalid/);
  assert.match(
    orderMigration,
    /classification_status = 'legacy'[\s\S]*classification_source = 'legacy'/,
  );
  assert.match(
    orderMigration,
    /classification_status = 'pending'[\s\S]*classification_source = 'fallback'/,
  );
  assert.match(
    orderMigration,
    /classification_status = 'classified'[\s\S]*'user_category', 'search_suggestion', 'moderator'/,
  );
  assert.match(orderMigration, /order_moderator_transition_requires_trusted_actor/);
  assert.match(orderMigration, /CREATE TABLE IF NOT EXISTS public\.order_classification_audit/);
  assert.match(orderMigration, /actor_id uuid NOT NULL/);
  assert.doesNotMatch(orderMigration, /order_classification_audit[\s\S]{0,800}ON DELETE CASCADE/);
  assert.match(orderMigration, /CREATE OR REPLACE FUNCTION public\.reclassify_order_by_service/);
  assert.match(orderMigration, /SECURITY INVOKER/);
  assert.match(
    orderMigration,
    /REVOKE ALL ON FUNCTION public\.reclassify_order_by_service[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    orderMigration,
    /GRANT EXECUTE ON FUNCTION public\.reclassify_order_by_service[\s\S]*TO service_role/,
  );
  assert.match(orderMigration, /universal_order_service_role_requires_live_preflight/);
});

test("blocking is owner-managed and composes restrictively with existing policies", () => {
  assert.match(blockingMigration, /CREATE TABLE IF NOT EXISTS public\.user_blocks/);
  assert.match(blockingMigration, /PRIMARY KEY \(blocker_id, blocked_id\)/);
  assert.match(blockingMigration, /CHECK \(blocker_id <> blocked_id\)/);
  assert.match(blockingMigration, /FOR SELECT TO authenticated[\s\S]*auth\.uid\(\)\) = blocker_id/);
  assert.match(blockingMigration, /FOR INSERT TO authenticated[\s\S]*auth\.uid\(\)\) = blocker_id/);
  assert.match(blockingMigration, /FOR DELETE TO authenticated[\s\S]*auth\.uid\(\)\) = blocker_id/);
  assert.ok((blockingMigration.match(/AS RESTRICTIVE/g) ?? []).length >= 4);
  assert.match(blockingMigration, /current_user_can_interact_with\(p_master_id\)/);
  assert.match(blockingMigration, /auth\.uid\(\) IS NOT NULL/);
  assert.match(blockingMigration, /order_row\.client_id = auth\.uid\(\)/);
  assert.match(
    blockingMigration,
    /REVOKE ALL ON FUNCTION public\.get_master_phone\(uuid\) FROM anon/,
  );
  assert.match(
    blockingMigration,
    /GRANT EXECUTE ON FUNCTION public\.get_master_phone\(uuid\) TO authenticated/,
  );
  assert.match(
    blockingMigration,
    /GRANT EXECUTE ON FUNCTION public\.current_user_can_interact_with\(uuid\) TO anon, authenticated/,
  );
  assert.match(blockingMigration, /user_blocking_contact_visibility_phase_not_ready/);
  assert.match(
    blockingMigration,
    /has_function_privilege\('anon', 'public\.get_master_phone\(uuid\)', 'EXECUTE'\)/,
  );
  assert.match(
    blockingMigration,
    /has_column_privilege\('anon', 'public\.users', 'contact_phone', 'SELECT'\)/,
  );
  assert.match(
    blockingMigration,
    /has_column_privilege\('authenticated', 'public\.users', 'contact_phone', 'SELECT'\)/,
  );
  assert.ok(
    blockingMigration.indexOf("user_blocking_contact_visibility_phase_not_ready") <
      blockingMigration.indexOf("CREATE OR REPLACE FUNCTION public.get_master_phone"),
    "contact compatibility preflight must run before replacing the old RPC",
  );
  const contactFunction = blockingMigration.slice(
    blockingMigration.indexOf("CREATE OR REPLACE FUNCTION public.get_master_phone"),
    blockingMigration.indexOf("REVOKE ALL ON FUNCTION public.get_master_phone"),
  );
  assert.doesNotMatch(contactFunction, /users_private|upr\.phone|COALESCE\(pu\.contact_phone/i);
  assert.match(read("supabase/migration-drafts/README.md"), /contact_phone.*public work number/is);
  assert.match(read("supabase/migration-drafts/README.md"), /users_private\.phone.*private/is);
  assert.match(blockingMigration, /ADD VALUE IF NOT EXISTS 'response'/);
  assert.match(blockingMigration, /CHECK \(target_type <> 'message'\) NOT VALID/);
  assert.match(
    blockingMigration,
    /CREATE TABLE IF NOT EXISTS public\.universal_backend_promotion_blockers/,
  );
  for (const blockerKey of [
    "notification_matching_live_audit",
    "security_definer_rpc_inventory_live_audit",
    "blocking_profile_visibility_live_audit",
    "blocking_push_realtime_live_audit",
    "blocking_storage_policy_live_audit",
    "verification_eligibility_live_audit",
  ]) {
    assert.match(blockingMigration, new RegExp(`'${blockerKey}'`));
  }
  assert.match(
    blockingMigration,
    /matching_enabled L1\/L2, published moderation, verified master where required, and no block in either direction/,
  );
  assert.match(
    blockingMigration,
    /CREATE OR REPLACE FUNCTION public\.assert_universal_backend_promotion_ready/,
  );
  assert.match(blockingMigration, /universal_backend_promotion_blocked/);
  assert.match(promotionGate, /\\set ON_ERROR_STOP on/);
  assert.match(promotionGate, /SET LOCAL ROLE service_role/);
  assert.match(promotionGate, /SELECT public\.assert_universal_backend_promotion_ready\(\)/);
  assert.doesNotMatch(promotionGate, /EXCEPTION|WHEN raise_exception/);
  assert.match(
    read("supabase/migration-drafts/README.md"),
    /exit code `0`[\s\S]*universal-promotion-gate\.sql/,
  );
  assert.match(
    read("supabase/migration-drafts/README.md"),
    /does \*\*not\*\* claim complete blocking for profiles\/search,[\s\S]*push,[\s\S]*Realtime,[\s\S]*storage\/signed URLs[\s\S]*SECURITY DEFINER/,
  );
});

test("every historical migration through 0119 still matches the reviewed SHA baseline", () => {
  const baseline = JSON.parse(read("supabase/migration-integrity-baseline.json"));
  const historicalEntries = Object.entries(baseline.migrationHistory).filter(([path]) => {
    const filename = path.split("/").at(-1) ?? "";
    const number = Number.parseInt(filename.slice(0, 4), 10);
    return Number.isInteger(number) && number <= 119;
  });

  assert.ok(historicalEntries.length >= 128);
  for (const [path, expectedHash] of historicalEntries) {
    assert.equal(sha256(read(path)), expectedHash, `${path} changed after the reviewed baseline`);
  }
});
