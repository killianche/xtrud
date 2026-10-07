import { describe, expect, it } from "vitest";
import { searchCatalogByWords } from "@/features/categories/bundled-task-catalog";
import { searchTaskPhrases } from "@/features/categories/task-phrase-search";
import { TASK_PHRASES } from "@/features/categories/task-phrases";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { guessCategoryId } from "./guess-category";

const visible = new Set(TASK_PHRASES.map((p) => p.l2));
const guess = (text: string) =>
  guessCategoryId(
    searchTaskPhrases(text, TASK_PHRASES, 6).map((h) => h.phrase),
    searchCatalogByWords(text, 5),
    visible,
  );

describe("guessCategoryId", () => {
  it("формулировка из словаря — её категория", () => {
    expect(guess("Убраться в комнате")).toBe("cleaning");
    expect(guess("ремонт котла")).toBe("climate");
  });

  it("длинная фраза своими словами — явный лидер по словам (снимок владельца №259)", () => {
    expect(guess("Убраться в комнате 10 квадратов")).toBe("cleaning");
  });

  it("нет явного лидера — без категории, подберёт админ", () => {
    expect(
      guessCategoryId(
        [],
        [
          { l2_id: "a", score: 0.9 },
          { l2_id: "b", score: 0.9 },
        ],
        new Set(["a", "b"]),
      ),
    ).toBe(UNCATEGORIZED_L2_ID);
    expect(guess("абракадабра")).toBe(UNCATEGORIZED_L2_ID);
  });

  it("скрытая категория не ставится", () => {
    expect(guessCategoryId([{ l2: "hidden" }], [{ l2_id: "a", score: 1 }], new Set(["a"]))).toBe(
      "a",
    );
  });
});
