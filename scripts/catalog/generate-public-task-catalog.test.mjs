import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicTaskCatalog,
  resolveReleaseCatalogSource,
  serializePublicTaskCatalog,
} from "./generate-public-task-catalog.mjs";

// Разделы: «business» намеренно выключен — категория «legal» под ним обязана
// выпасть из бандла, как раньше выпадала по зашитому списку.
const sections = [
  { id: "construction", name_ru: "Строительство", icon: "Crane", sort_order: 1, is_active: true },
  { id: "business", name_ru: "Бизнес", icon: "Briefcase", sort_order: 2, is_active: false },
];

const categories = [
  {
    id: "wallpaper",
    l1_id: "construction",
    name_ru: "Обои",
    icon: "Paintbrush",
    sort_order: 20,
    is_active: true,
    is_visible: true,
    is_featured: false,
  },
  {
    id: "legal",
    l1_id: "business",
    name_ru: "Юридические услуги",
    icon: "Scales",
    sort_order: 1,
    is_active: true,
    is_visible: true,
    is_featured: true,
  },
  {
    id: "hidden",
    l1_id: "construction",
    name_ru: "Скрытая",
    icon: "EyeSlash",
    sort_order: 1,
    is_active: true,
    is_visible: false,
    is_featured: false,
  },
];

const services = [
  {
    id: "wallpaper-install",
    l2_id: "wallpaper",
    name_ru: "Поклейка обоев",
    sort_order: 20,
    is_active: true,
  },
  {
    id: "wallpaper-removal",
    l2_id: "wallpaper",
    name_ru: "Удаление старых обоев",
    sort_order: 30,
    is_active: true,
  },
  {
    id: "hidden-service",
    l2_id: "hidden",
    name_ru: "Скрытая услуга",
    sort_order: 1,
    is_active: true,
  },
];

const terms = [
  { term: "поклеить обои", l2_id: "wallpaper", l3_id: null, weight: 100 },
  { term: "снять обои", l2_id: null, l3_id: "wallpaper-removal", weight: 100 },
  { term: "секрет", l2_id: "hidden", l3_id: null, weight: 100 },
  { term: "юрист", l2_id: "legal", l3_id: null, weight: 100 },
];

test("buildPublicTaskCatalog keeps only active visible current-scope public data", () => {
  const catalog = buildPublicTaskCatalog({ sections, categories, services, terms });

  assert.deepEqual(
    catalog.sections.map((item) => item.id),
    ["construction"],
  );
  assert.deepEqual(
    catalog.categories.map((item) => item.id),
    ["wallpaper"],
  );
  assert.deepEqual(
    catalog.services.map((item) => item.id),
    ["wallpaper-install", "wallpaper-removal"],
  );
  assert.deepEqual(
    catalog.terms.map((item) => item.term),
    ["поклеить обои", "снять обои"],
  );
});

test("serialization is deterministic and excludes backend metadata", () => {
  const first = serializePublicTaskCatalog(
    buildPublicTaskCatalog({ sections, categories, services, terms }),
  );
  const second = serializePublicTaskCatalog(
    buildPublicTaskCatalog({
      sections: [...sections].reverse(),
      categories: [...categories].reverse(),
      services: [...services].reverse(),
      terms: [...terms].reverse(),
    }),
  );

  assert.equal(first, second);
  assert.doesNotMatch(first, /supabase|https?:\/\/|anon|created_at|avg_check|price/i);
  assert.match(first, /"content_sha256": "[a-f0-9]{64}"/);
});

test("duplicate public identifiers fail instead of being silently discarded", () => {
  assert.throws(
    () =>
      buildPublicTaskCatalog({
        sections,
        categories: [categories[0], categories[0]],
        services,
        terms,
      }),
    /дубликат categories\.id wallpaper/,
  );
});

test("release drift source is bound to the EAS backend and production ledger", () => {
  const url = "https://api.example.test";
  const easConfig = {
    build: {
      base: { env: { EXPO_PUBLIC_API_URL: url } },
      production: { extends: "base", env: { EXPO_PUBLIC_DEMO_MODE: "false" } },
    },
  };
  const ledger = { backend: { url } };

  assert.deepEqual(resolveReleaseCatalogSource(easConfig, ledger), { baseUrl: url });
  assert.throws(
    () =>
      resolveReleaseCatalogSource(easConfig, { backend: { url: "https://wrong.example.test" } }),
    /backend URL.*различаются/,
  );
});
