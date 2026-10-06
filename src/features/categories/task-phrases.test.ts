import { describe, expect, it } from "vitest";
import catalog from "@/generated/task-catalog.json";
import { TASK_PHRASES } from "./task-phrases";

// Словарь формулировок (№248) ссылается на подкатегории каталога. Если каталог
// поменяется (категорию переименуют или уберут), тест покажет, какие
// формулировки повисли.
const categoryIds = new Set(catalog.categories.map((category) => category.id));
const normalize = (text: string) => text.toLowerCase().replace(/ё/g, "е");

describe("TASK_PHRASES", () => {
  it("ссылается только на существующие категории каталога", () => {
    const unknown = TASK_PHRASES.filter((phrase) => !categoryIds.has(phrase.l2));
    expect(unknown).toEqual([]);
  });

  it("покрывает каждую категорию минимум шестью формулировками", () => {
    const counts = new Map<string, number>();
    for (const phrase of TASK_PHRASES) {
      counts.set(phrase.l2, (counts.get(phrase.l2) ?? 0) + 1);
    }
    const thin = [...categoryIds].filter((id) => (counts.get(id) ?? 0) < 6);
    expect(thin).toEqual([]);
  });

  it("не содержит дублей без учёта регистра и ё/е", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const phrase of TASK_PHRASES) {
      const key = normalize(phrase.text);
      if (seen.has(key)) duplicates.push(phrase.text);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it("держит формулировки короткими, с заглавной буквы и без точки", () => {
    const bad = TASK_PHRASES.filter(
      (phrase) =>
        phrase.text.length === 0 ||
        phrase.text.length > 60 ||
        phrase.text !== phrase.text.trim() ||
        phrase.text.endsWith(".") ||
        phrase.text[0] !== phrase.text[0]?.toUpperCase(),
    );
    expect(bad).toEqual([]);
  });

  it("задаёт weight целым числом от 1 до 100", () => {
    const bad = TASK_PHRASES.filter(
      (phrase) => !Number.isInteger(phrase.weight) || phrase.weight < 1 || phrase.weight > 100,
    );
    expect(bad).toEqual([]);
  });

  it("укладывается в объём словаря 600–1000 формулировок", () => {
    expect(TASK_PHRASES.length).toBeGreaterThanOrEqual(600);
    expect(TASK_PHRASES.length).toBeLessThanOrEqual(1000);
  });
});
