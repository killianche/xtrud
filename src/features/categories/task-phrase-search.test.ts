import { describe, expect, it } from "vitest";
import { searchTaskPhrases } from "./task-phrase-search";
import { TASK_PHRASES } from "./task-phrases";

const P = [
  { text: "Отремонтировать газовый котёл", l2: "climate", weight: 70 },
  { text: "Отремонтировать котёл", l2: "climate", weight: 60 },
  { text: "Отремонтировать компьютер", l2: "pc-repair", weight: 60 },
  { text: "Отремонтировать кондиционер", l2: "climate-control", weight: 50 },
  { text: "Отремонтировать стиральную машину", l2: "appliance-repair", weight: 80 },
  { text: "Вывезти строительный мусор", l2: "disposal", weight: 70 },
  { text: "Вывоз мусора", l2: "disposal", weight: 90 },
  { text: "Генеральная уборка квартиры", l2: "cleaning", weight: 95 },
  { text: "Уборка после ремонта", l2: "cleaning-post-renovation", weight: 70 },
  { text: "Заменить розетку", l2: "electrical", weight: 85 },
];
const texts = (q: string) => searchTaskPhrases(q, P).map((h) => h.phrase.text);

describe("searchTaskPhrases — как подсказки YouDo", () => {
  it("последнее слово печатается — совпадает началом", () => {
    // Частое выше; при равной частоте — по алфавиту.
    expect(texts("отремонтировать ко")).toEqual([
      "Отремонтировать газовый котёл",
      "Отремонтировать компьютер",
      "Отремонтировать котёл",
      "Отремонтировать кондиционер",
    ]);
  });

  it("законченные слова — с любыми окончаниями и ё/е", () => {
    expect(texts("отремонтировать котел ")).toContain("Отремонтировать котёл");
    // «ремонт» = «отремонтировать», «поменять» = «заменить» (SAME_WORK).
    expect(texts("ремонт котла")).toEqual([
      "Отремонтировать газовый котёл",
      "Отремонтировать котёл",
    ]);
    expect(texts("котла отремонтировать")).toContain("Отремонтировать газовый котёл");
    expect(texts("поменять розетку")).toEqual(["Заменить розетку"]);
    expect(texts("заменить розетки")).toEqual(["Заменить розетку"]);
  });

  it("вывоз мусора и уборка — то, что не находили тестировщики", () => {
    expect(texts("вывоз мусора")[0]).toBe("Вывоз мусора");
    expect(texts("мусор")).toEqual(["Вывоз мусора", "Вывезти строительный мусор"]);
    expect(texts("уборка")[0]).toBe("Уборка после ремонта");
    expect(texts("уборк")).toEqual(expect.arrayContaining(["Генеральная уборка квартиры"]));
  });

  it("служебные слова не сужают поиск", () => {
    expect(texts("нужно вывоз мусора")[0]).toBe("Вывоз мусора");
    expect(texts("")).toEqual([]);
  });
});

describe("searchTaskPhrases на словаре TASK_PHRASES — сценарии тестировщиков (№248)", async () => {
  const { TASK_PHRASES } = await import("./task-phrases");
  const top = (q: string) => searchTaskPhrases(q, TASK_PHRASES);

  it("котёл в любой форме — отопление, без котлована", () => {
    for (const q of ["отремонтировать котел", "отремонтировать котёл", "ремонт котла", "котла"]) {
      const hits = top(q);
      expect(hits.length, q).toBeGreaterThan(0);
      expect(
        hits.every((h) => h.phrase.l2 === "climate"),
        q,
      ).toBe(true);
    }
    expect(top("котла").some((h) => /котлован/i.test(h.phrase.text))).toBe(false);
  });

  it("вывоз мусора — вывоз мусора", () => {
    for (const q of ["вывоз мусора", "вывезти мусор", "мусор"]) {
      expect(top(q)[0]?.phrase.l2, q).toBe("disposal");
    }
  });

  it("уборка — уборочные, среди них генеральная", () => {
    const hits = top("уборка");
    expect(
      hits.every((h) => h.phrase.l2.startsWith("cleaning")),
      "только уборка",
    ).toBe(true);
    expect(hits.some((h) => /генеральная/i.test(h.phrase.text))).toBe(true);
  });
});

describe("уборка своими словами (№259)", () => {
  const texts = (q: string) => searchTaskPhrases(q, TASK_PHRASES, 6).map((h) => h.phrase.text);

  it("«убраться в комнате» — уборка, без вмятин и ванной комнаты", () => {
    const hits = searchTaskPhrases("Убраться в комнате", TASK_PHRASES, 6);
    expect(hits[0]?.phrase.text).toBe("Убраться в комнате");
    expect(hits.some((h) => h.phrase.l2 === "body-repair" || h.phrase.l2 === "renovation")).toBe(
      false,
    );
  });

  it("предлог в конце не требует слова на эту букву", () => {
    expect(texts("убраться в")).not.toContain("Убрать вмятину");
    expect(texts("убраться в")[0]).toMatch(/^Убраться в/);
  });

  it("«убрать вмятину» — по-прежнему кузовной ремонт", () => {
    expect(searchTaskPhrases("убрать вмятину", TASK_PHRASES, 6)[0]?.phrase.l2).toBe("body-repair");
  });
});
