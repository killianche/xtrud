import { describe, expect, it } from "vitest";
import { mergeRecentSearch, parseRecentSearches } from "./recent-searches";

describe("parseRecentSearches", () => {
  it("читает сохранённый список", () => {
    expect(parseRecentSearches('["поклеить обои","убрать двор"]')).toEqual([
      "поклеить обои",
      "убрать двор",
    ]);
  });

  it("переживает пустое и битое хранилище", () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches("не json")).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
  });

  it("отбрасывает мусор и слишком короткие записи", () => {
    expect(parseRecentSearches('["ок",1,null,"a","  "]')).toEqual(["ок"]);
  });

  it("не отдаёт больше десяти записей", () => {
    const many = JSON.stringify(Array.from({ length: 25 }, (_, i) => `запрос ${i}`));
    expect(parseRecentSearches(many)).toHaveLength(10);
  });
});

describe("mergeRecentSearch", () => {
  it("ставит новую запись первой", () => {
    expect(mergeRecentSearch(["убрать двор"], "поклеить обои")).toEqual([
      "поклеить обои",
      "убрать двор",
    ]);
  });

  it("поднимает повтор наверх, не дублируя его", () => {
    expect(mergeRecentSearch(["убрать двор", "поклеить обои"], "Поклеить Обои")).toEqual([
      "Поклеить Обои",
      "убрать двор",
    ]);
  });

  it("игнорирует слишком короткий запрос", () => {
    expect(mergeRecentSearch(["убрать двор"], "о")).toEqual(["убрать двор"]);
  });

  it("держит историю короткой", () => {
    const previous = Array.from({ length: 10 }, (_, i) => `запрос ${i}`);
    const next = mergeRecentSearch(previous, "новый запрос");
    expect(next).toHaveLength(10);
    expect(next[0]).toBe("новый запрос");
    expect(next).not.toContain("запрос 9");
  });

  it("не мутирует переданный список", () => {
    const previous = ["убрать двор"];
    mergeRecentSearch(previous, "поклеить обои");
    expect(previous).toEqual(["убрать двор"]);
  });
});
