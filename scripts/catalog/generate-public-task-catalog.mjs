#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "@expo/env";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
const OUTPUT_PATH = resolve(ROOT, "src/generated/task-catalog.json");
const EAS_CONFIG_PATH = resolve(ROOT, "eas.json");
const PRODUCTION_LEDGER_PATH = resolve(ROOT, "release/production.json");
const PAGE_SIZE = 1_000;

function compareText(left, right) {
  return left.localeCompare(right, "ru-RU");
}

function compareByPosition(left, right) {
  return left.sort_order - right.sort_order || compareText(left.name_ru, right.name_ru);
}

function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Каталог: ${field} должен быть непустой строкой.`);
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new Error(`Каталог: ${field} должен быть boolean.`);
  }
  return value;
}

function requireNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Каталог: ${field} должен быть конечным числом.`);
  }
  return value;
}

function nullableString(value, field) {
  if (value === null) return null;
  return requireString(value, field);
}

function assertUniqueBy(items, identity, label) {
  const seen = new Set();
  for (const item of items) {
    const key = identity(item);
    if (seen.has(key)) throw new Error(`Каталог: найден дубликат ${label} ${key}.`);
    seen.add(key);
  }
  return items;
}

export function resolveReleaseCatalogSource(easConfig, productionLedger) {
  if (easConfig?.build?.production?.extends !== "base") {
    throw new Error("Каталог: EAS production должен наследовать build.base.");
  }
  const releaseEnv = {
    ...(easConfig?.build?.base?.env ?? {}),
    ...(easConfig?.build?.production?.env ?? {}),
  };
  const baseUrl = requireString(
    releaseEnv.EXPO_PUBLIC_SUPABASE_URL,
    "eas.build.production EXPO_PUBLIC_SUPABASE_URL",
  );
  const anonKey = requireString(
    releaseEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    "eas.build.production EXPO_PUBLIC_SUPABASE_ANON_KEY",
  );
  const ledgerUrl = requireString(productionLedger?.backend?.url, "release.backend.url");
  const expectedKeyHash = requireString(
    productionLedger?.backend?.clientKeySha256,
    "release.backend.clientKeySha256",
  );
  const actualKeyHash = createHash("sha256").update(anonKey).digest("hex");
  if (baseUrl !== ledgerUrl) {
    throw new Error("Каталог: backend URL в EAS и production ledger различаются.");
  }
  if (actualKeyHash !== expectedKeyHash) {
    throw new Error("Каталог: hash client key в EAS не совпадает с production ledger.");
  }
  return { baseUrl, anonKey };
}

export function buildPublicTaskCatalog({ sections, categories, services, terms }) {
  // Разделы (L1). Источник истины о том, что показывается, — is_active в базе;
  // списка разделов в коде больше нет (см. src/lib/product-scope.ts).
  const publicSections = assertUniqueBy(
    sections
      .map((section) => ({
        id: requireString(section.id, "sections.id"),
        name_ru: requireString(section.name_ru, "sections.name_ru"),
        icon: requireString(section.icon, "sections.icon"),
        sort_order: requireNumber(section.sort_order, "sections.sort_order"),
        is_active: requireBoolean(section.is_active, "sections.is_active"),
      }))
      .filter((section) => section.is_active)
      .sort(compareByPosition),
    (section) => section.id,
    "sections.id",
  );
  const activeSectionIds = new Set(publicSections.map((section) => section.id));

  const publicCategories = assertUniqueBy(
    categories
      .map((category) => ({
        id: requireString(category.id, "categories.id"),
        l1_id: requireString(category.l1_id, "categories.l1_id"),
        name_ru: requireString(category.name_ru, "categories.name_ru"),
        icon: requireString(category.icon, "categories.icon"),
        sort_order: requireNumber(category.sort_order, "categories.sort_order"),
        is_active: requireBoolean(category.is_active, "categories.is_active"),
        is_visible: requireBoolean(category.is_visible, "categories.is_visible"),
        is_featured: requireBoolean(category.is_featured, "categories.is_featured"),
      }))
      .filter(
        (category) =>
          category.is_active && category.is_visible && activeSectionIds.has(category.l1_id),
      )
      .sort(compareByPosition),
    (category) => category.id,
    "categories.id",
  );
  const allowedL2Ids = new Set(publicCategories.map((category) => category.id));

  const publicServices = assertUniqueBy(
    services
      .map((service) => ({
        id: requireString(service.id, "services.id"),
        l2_id: requireString(service.l2_id, "services.l2_id"),
        name_ru: requireString(service.name_ru, "services.name_ru"),
        sort_order: requireNumber(service.sort_order, "services.sort_order"),
        is_active: requireBoolean(service.is_active, "services.is_active"),
      }))
      .filter((service) => service.is_active && allowedL2Ids.has(service.l2_id))
      .sort(
        (left, right) =>
          compareText(left.l2_id, right.l2_id) ||
          left.sort_order - right.sort_order ||
          compareText(left.name_ru, right.name_ru),
      ),
    (service) => service.id,
    "services.id",
  );
  const allowedL3Ids = new Set(publicServices.map((service) => service.id));

  const publicTerms = assertUniqueBy(
    terms
      .map((term) => ({
        term: requireString(term.term, "terms.term"),
        l2_id: nullableString(term.l2_id, "terms.l2_id"),
        l3_id: nullableString(term.l3_id, "terms.l3_id"),
        weight: requireNumber(term.weight, "terms.weight"),
      }))
      .filter(
        (term) =>
          (term.l2_id !== null && term.l3_id === null && allowedL2Ids.has(term.l2_id)) ||
          (term.l2_id === null && term.l3_id !== null && allowedL3Ids.has(term.l3_id)),
      )
      .sort(
        (left, right) =>
          compareText(left.term, right.term) ||
          compareText(left.l2_id ?? "", right.l2_id ?? "") ||
          compareText(left.l3_id ?? "", right.l3_id ?? "") ||
          right.weight - left.weight,
      ),
    (term) => `${term.term}\u0000${term.l2_id ?? ""}\u0000${term.l3_id ?? ""}`,
    "terms identity",
  );

  const content = {
    schema_version: 2,
    sections: publicSections,
    categories: publicCategories,
    services: publicServices,
    terms: publicTerms,
  };
  return {
    ...content,
    content_sha256: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
  };
}

export function serializePublicTaskCatalog(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

async function fetchPage(url, anonKey, from, to) {
  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Range: `${from}-${to}`,
      Prefer: "count=exact",
    },
  });
  if (!response.ok) {
    throw new Error(`Каталог: read-only запрос завершился HTTP ${response.status}.`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Каталог: backend вернул не массив.");
  return data;
}

async function fetchAll(baseUrl, table, query, anonKey) {
  const result = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const page = await fetchPage(url, anonKey, from, from + PAGE_SIZE - 1);
    result.push(...page);
    if (page.length < PAGE_SIZE) return result;
  }
}

export async function readPublicTaskCatalog(baseUrl, anonKey) {
  const sections = await fetchAll(
    baseUrl,
    "categories_l1",
    {
      select: "id,name_ru,icon,sort_order,is_active",
      is_active: "eq.true",
      order: "sort_order.asc,name_ru.asc",
    },
    anonKey,
  );
  const categories = await fetchAll(
    baseUrl,
    "categories_l2",
    {
      select: "id,l1_id,name_ru,icon,sort_order,is_active,is_visible,is_featured",
      is_active: "eq.true",
      is_visible: "eq.true",
      l1_id: `in.(${sections.map((section) => section.id).join(",")})`,
      order: "sort_order.asc,name_ru.asc",
    },
    anonKey,
  );
  const l2Ids = categories.map((category) => requireString(category.id, "categories.id"));
  const services =
    l2Ids.length === 0
      ? []
      : await fetchAll(
          baseUrl,
          "categories_l3",
          {
            select: "id,l2_id,name_ru,sort_order,is_active",
            is_active: "eq.true",
            l2_id: `in.(${l2Ids.join(",")})`,
            order: "l2_id.asc,sort_order.asc,name_ru.asc",
          },
          anonKey,
        );
  const terms = await fetchAll(
    baseUrl,
    "category_terms",
    {
      select: "term,l2_id,l3_id,weight",
      order: "term.asc,l2_id.asc,l3_id.asc,weight.desc",
    },
    anonKey,
  );

  return buildPublicTaskCatalog({ sections, categories, services, terms });
}

async function main() {
  let baseUrl;
  let anonKey;
  if (process.argv.includes("--release-source")) {
    ({ baseUrl, anonKey } = resolveReleaseCatalogSource(
      JSON.parse(readFileSync(EAS_CONFIG_PATH, "utf8")),
      JSON.parse(readFileSync(PRODUCTION_LEDGER_PATH, "utf8")),
    ));
  } else {
    const envMode = process.env.CATALOG_ENV_MODE === "production" ? "production" : "development";
    loadProjectEnv(ROOT, { mode: envMode, silent: true });
    baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  }
  if (!baseUrl || !anonKey) {
    throw new Error("Каталог: нужны EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const serialized = serializePublicTaskCatalog(await readPublicTaskCatalog(baseUrl, anonKey));
  if (process.argv.includes("--check")) {
    if (readFileSync(OUTPUT_PATH, "utf8") !== serialized) {
      throw new Error("src/generated/task-catalog.json устарел. Запусти npm run catalog:generate.");
    }
    console.log("Public task catalog is current.");
    return;
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialized);
  console.log("Updated src/generated/task-catalog.json.");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
