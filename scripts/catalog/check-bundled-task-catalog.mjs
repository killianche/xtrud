#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const path = resolve(ROOT, "src/generated/task-catalog.json");
const catalog = JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => {
  throw new Error(`Bundled task catalog: ${message}`);
};

if (catalog.schema_version !== 2) fail("unsupported schema_version");
if (!Array.isArray(catalog.sections)) fail("sections must be an array");
if (!Array.isArray(catalog.categories)) fail("categories must be an array");
if (!Array.isArray(catalog.services)) fail("services must be an array");
if (!Array.isArray(catalog.terms)) fail("terms must be an array");
if (!/^[a-f0-9]{64}$/.test(catalog.content_sha256 ?? "")) fail("invalid content_sha256");

const content = {
  schema_version: catalog.schema_version,
  sections: catalog.sections,
  categories: catalog.categories,
  services: catalog.services,
  terms: catalog.terms,
};
const actualHash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
if (actualHash !== catalog.content_sha256) fail("content_sha256 mismatch");

function uniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (typeof item.id !== "string" || item.id.length === 0) fail(`${label} has an invalid id`);
    if (ids.has(item.id)) fail(`${label} contains duplicate id ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

const sectionIds = uniqueIds(catalog.sections, "sections");
for (const section of catalog.sections) {
  if (!section.is_active) fail(`section ${section.id} is inactive`);
}

const l2Ids = uniqueIds(catalog.categories, "categories");
for (const category of catalog.categories) {
  if (!category.is_active || !category.is_visible) fail(`category ${category.id} is not public`);
  // Раздел категории обязан быть в бандле: иначе на главной она осиротеет.
  if (!sectionIds.has(category.l1_id)) fail(`category ${category.id} has a dangling l1_id`);
}

const l3Ids = uniqueIds(catalog.services, "services");
for (const service of catalog.services) {
  if (!service.is_active) fail(`service ${service.id} is inactive`);
  if (!l2Ids.has(service.l2_id)) fail(`service ${service.id} has a dangling l2_id`);
}

const termKeys = new Set();
for (const term of catalog.terms) {
  const hasL2 = typeof term.l2_id === "string";
  const hasL3 = typeof term.l3_id === "string";
  if (hasL2 === hasL3) fail(`term ${term.term} must reference exactly one level`);
  if (hasL2 && !l2Ids.has(term.l2_id)) fail(`term ${term.term} has a dangling l2_id`);
  if (hasL3 && !l3Ids.has(term.l3_id)) fail(`term ${term.term} has a dangling l3_id`);
  const key = `${term.term}\u0000${term.l2_id ?? ""}\u0000${term.l3_id ?? ""}`;
  if (termKeys.has(key)) fail(`duplicate term identity ${term.term}`);
  termKeys.add(key);
}

const serialized = JSON.stringify(catalog);
if (/https?:\/\/|supabase|anon_key|service_role|avg_check|price/i.test(serialized)) {
  fail("contains endpoint, credential or price metadata");
}

console.log(
  `Bundled task catalog OK: ${l2Ids.size} L2, ${l3Ids.size} L3, ${catalog.terms.length} terms.`,
);
