import { describe, expect, it } from "vitest";
import type { SearchHit } from "@/features/categories/use-search-categories";
import {
  buildTaskIntentCategoryCandidates,
  buildTaskIntentSuggestions,
  changedTaskIntentDraft,
  resolveTaskIntentQuery,
} from "@/features/orders/task-intent-suggestions";

const categories = [
  { id: "windows-doors", name_ru: "Окна и двери" },
  { id: "wallpaper", name_ru: "Обои" },
  { id: "electrical", name_ru: "Электрика" },
];

const windowFilmHit: SearchHit = {
  kind: "l3",
  id: "window-film",
  l2_id: "windows-doors",
  name_ru: "Плёнка на окна",
  score: 1,
  source: "synonym",
};

const hits: SearchHit[] = [
  windowFilmHit,
  {
    kind: "l3",
    id: "wallpaper-vinyl",
    l2_id: "wallpaper",
    name_ru: "Поклейка виниловых обоев",
    score: 0.8,
    source: "fts",
  },
];

describe("buildTaskIntentSuggestions", () => {
  it("invalidates a previously confirmed category as soon as intent wording changes", () => {
    expect(changedTaskIntentDraft("  заменить   розетку ")).toEqual({
      title: "заменить розетку",
      l2Id: "",
    });
  });

  it("keeps the user's wording as the first explicit L2 confirmation", () => {
    expect(
      buildTaskIntentSuggestions("  поклеить   пленку на окна ", hits, categories)[0],
    ).toMatchObject({
      title: "Поклеить пленку на окна",
      l2Id: "windows-doors",
      categoryName: "Окна и двери",
    });
  });

  it("does not turn a production-shaped wallpaper match into a removal intent", () => {
    const wallpaperHits: SearchHit[] = [
      {
        kind: "l2",
        id: "wallpaper",
        l2_id: "wallpaper",
        name_ru: "Обои",
        score: 1,
        source: "synonym",
      },
      {
        kind: "l3",
        id: "wallpaper-removal",
        l2_id: "wallpaper",
        name_ru: "Удаление старых обоев",
        score: 0.74,
        source: "synonym",
      },
    ];

    const result = buildTaskIntentSuggestions("поклеить обои", wallpaperHits, categories);
    expect(result.map((item) => item.title)).toEqual(["Поклеить обои"]);
    expect(result.map((item) => item.title)).not.toContain("Удаление старых обоев");
    expect(result.every((item) => item.l2Id === "wallpaper")).toBe(true);
  });

  it("uses the confirmed keyboard-layout correction as the public title", () => {
    const corrected = resolveTaskIntentQuery("gjrktbnm j,jb", true, "поклеить обои");
    const wallpaperHit: SearchHit = {
      kind: "l2",
      id: "wallpaper",
      l2_id: "wallpaper",
      name_ru: "Обои",
      score: 1,
      source: "synonym",
    };

    expect(buildTaskIntentSuggestions(corrected, [wallpaperHit], categories)[0]?.title).toBe(
      "Поклеить обои",
    );
  });

  it("does not let an FTS sibling rewrite the user's title", () => {
    const serviceHits: SearchHit[] = [
      {
        kind: "l2",
        id: "electrical",
        l2_id: "electrical",
        name_ru: "Электрика",
        score: 1,
        source: "synonym",
      },
      {
        kind: "l3",
        id: "outlet-replace",
        l2_id: "electrical",
        name_ru: "Замена розетки",
        score: 0.4,
        source: "fts",
      },
      {
        kind: "l3",
        id: "outlet-install",
        l2_id: "electrical",
        name_ru: "Установка новой розетки",
        score: 0.28,
        source: "trigram",
      },
    ];

    expect(
      buildTaskIntentSuggestions("хочу заменить розетку", serviceHits, categories).map(
        (item) => item.title,
      ),
    ).toEqual(["Хочу заменить розетку"]);
  });

  it("accepts an exact synonym-backed L3 even when its public title is phrased differently", () => {
    const result = buildTaskIntentSuggestions(
      "поклеить пленку на окна",
      [windowFilmHit],
      categories,
    );

    expect(result.map((item) => item.title)).toEqual(["Поклеить пленку на окна", "Плёнка на окна"]);
  });

  it("fails closed for out-of-scope category hits", () => {
    const hiddenHit: SearchHit = {
      kind: "l2",
      id: "legal",
      l2_id: "legal",
      name_ru: "Юридическая помощь",
      score: 1,
      source: "synonym",
    };
    expect(buildTaskIntentSuggestions("нужен юрист", [hiddenHit], categories)).toEqual([]);
  });

  it("does not present a weak fuzzy hit as a confident category", () => {
    const weakHit: SearchHit = {
      kind: "l3",
      id: "outlet-install",
      l2_id: "electrical",
      name_ru: "Установка розетки",
      score: 0.24,
      source: "trigram",
    };

    // Слабое совпадение не становится готовой подсказкой: заголовок задания
    // и категорию по опечатке подставлять нельзя.
    expect(buildTaskIntentSuggestions("что-то хитрое с проводами", [weakHit], categories)).toEqual(
      [],
    );
  });

  it("предлагает совпадение по опечатке, если ничего лучше не нашлось", () => {
    // DECISION владельца 2026-09-03: «поиск не показывает нормальные
    // результаты». Раньше совпадение только по триграммам отбрасывалось, и
    // экран говорил «точной подсказки не нашли», хотя категория была найдена.
    // Теперь это явный кандидат с тапом, а не тупик.
    const typoHit: SearchHit = {
      kind: "l3",
      id: "outlet-install",
      l2_id: "electrical",
      name_ru: "Установка розетки",
      score: 0.24,
      source: "trigram",
    };

    expect(buildTaskIntentCategoryCandidates([typoHit], categories)).toEqual([
      {
        key: "category:electrical",
        l2Id: "electrical",
        categoryName: "Электрика",
        matchedServiceName: "Установка розетки",
      },
    ]);
  });

  it("смысловые совпадения вытесняют совпадения по опечатке", () => {
    const typoHit: SearchHit = {
      kind: "l3",
      id: "outlet-install",
      l2_id: "electrical",
      name_ru: "Установка розетки",
      score: 0.24,
      source: "trigram",
    };
    const lexicalHit: SearchHit = {
      kind: "l3",
      id: "wallpaper-vinyl",
      l2_id: "wallpaper",
      name_ru: "Поклейка виниловых обоев",
      score: 0.5,
      source: "fts",
    };

    expect(
      buildTaskIntentCategoryCandidates([typoHit, lexicalHit], categories).map((item) => item.l2Id),
    ).toEqual(["wallpaper"]);
  });

  it("keeps a weak lexical hit as an explicit category candidate", () => {
    const weakFtsHit: SearchHit = {
      kind: "l3",
      id: "outlet-install",
      l2_id: "electrical",
      name_ru: "Установка розетки",
      score: 0.4,
      source: "fts",
    };

    expect(buildTaskIntentCategoryCandidates([weakFtsHit], categories)).toEqual([
      {
        key: "category:electrical",
        l2Id: "electrical",
        categoryName: "Электрика",
        matchedServiceName: "Установка розетки",
      },
    ]);
  });

  it("requires category clarification when two strong categories are ambiguous", () => {
    const ambiguousHits: SearchHit[] = [
      {
        kind: "l2",
        id: "windows-doors",
        l2_id: "windows-doors",
        name_ru: "Окна и двери",
        score: 1,
        source: "synonym",
      },
      {
        kind: "l2",
        id: "wallpaper",
        l2_id: "wallpaper",
        name_ru: "Обои",
        score: 1,
        source: "synonym",
      },
    ];

    expect(buildTaskIntentSuggestions("обновить стены у окна", ambiguousHits, categories)).toEqual(
      [],
    );
    expect(
      buildTaskIntentCategoryCandidates(ambiguousHits, categories).map((item) => item.l2Id),
    ).toEqual(["windows-doors", "wallpaper"]);
  });

  it("deduplicates low-confidence candidates and respects the display limit", () => {
    const candidateHits: SearchHit[] = [
      { ...windowFilmHit, score: 0.55, source: "fts" },
      { ...windowFilmHit, id: "window-film-2", score: 0.5, source: "fts" },
      {
        kind: "l3",
        id: "wallpaper-vinyl",
        l2_id: "wallpaper",
        name_ru: "Поклейка виниловых обоев",
        score: 0.49,
        source: "fts",
      },
      {
        kind: "l3",
        id: "outlet",
        l2_id: "electrical",
        name_ru: "Розетка",
        score: 0.4,
        source: "fts",
      },
    ];

    expect(buildTaskIntentCategoryCandidates(candidateHits, categories, 2)).toHaveLength(2);
    expect(
      buildTaskIntentCategoryCandidates(candidateHits, categories, 3).map((item) => item.l2Id),
    ).toEqual(["windows-doors", "wallpaper", "electrical"]);
  });

  it("is deterministic and respects the display limit", () => {
    const first = buildTaskIntentSuggestions("поклеить пленку на окна", hits, categories, 2);
    const second = buildTaskIntentSuggestions("поклеить пленку на окна", hits, categories, 2);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });
});
