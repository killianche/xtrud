import { describe, expect, it } from "vitest";
import { searchCatalogByWords } from "./bundled-task-catalog";

const top = (q: string) => searchCatalogByWords(q, 5).map((h) => h.l2_id);

describe("searchCatalogByWords — фразы своими словами", () => {
  it("длинные фразы, которые сервер целиком не находит", () => {
    expect(top("нужно поменять розетку на кухне")).toEqual(["electrical"]);
    expect(top("собрать шкаф и повесить полку в детской комнате")).toContain("furniture");
    expect(top("течёт кран в ванной")[0]).toBe("plumbing");
    // Подключить или починить — обе подсказки уместны, человек выберет.
    expect(top("нужен мастер чтобы починить стиральную машину").slice(0, 2)).toEqual(
      expect.arrayContaining(["appliance-repair", "plumbing"]),
    );
    expect(top("поклеить обои в спальне")[0]).toBe("wallpaper");
    // Беглая гласная: «котёл» — «Отопление и котлы» (тест друзей, №248).
    expect(top("отремонтировать котёл")[0]).toBe("climate");
    expect(top("вывоз мусора")[0]).toBe("disposal");
    expect(top("перевезти диван на дачу")[0]).toBe("cargo-transport");
  });

  it("одни общие слова ничего не тянут за собой", () => {
    expect(top("нужно срочно")).toEqual([]);
  });
});
