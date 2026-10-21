import { describe, expect, it } from "vitest";
import {
  pickActiveOrdersL2Ids,
  pickSpecialistsCategoryId,
  shouldFallbackToRatingShowcase,
} from "./home-personalization";

describe("pickSpecialistsCategoryId", () => {
  it("нет заданий — null (гость или без заказов)", () => {
    expect(pickSpecialistsCategoryId([])).toBeNull();
  });

  it("берёт категорию самого свежего ОТКРЫТОГО задания, не самого первого в массиве", () => {
    expect(
      pickSpecialistsCategoryId([
        { l2_id: "electric", status: "open", created_at: "2026-10-01T00:00:00Z" },
        { l2_id: "plumbing", status: "open", created_at: "2026-10-20T00:00:00Z" },
      ]),
    ).toBe("plumbing");
  });

  it("игнорирует закрытые/завершённые задания", () => {
    expect(
      pickSpecialistsCategoryId([
        { l2_id: "electric", status: "completed", created_at: "2026-10-20T00:00:00Z" },
        { l2_id: "plumbing", status: "open", created_at: "2026-10-01T00:00:00Z" },
      ]),
    ).toBe("plumbing");
  });

  it("задание без категории не выбирается", () => {
    expect(
      pickSpecialistsCategoryId([
        { l2_id: null, status: "open", created_at: "2026-10-20T00:00:00Z" },
      ]),
    ).toBeNull();
  });
});

describe("pickActiveOrdersL2Ids", () => {
  it("нет своих категорий специалиста — null (без фильтра, как сейчас)", () => {
    expect(pickActiveOrdersL2Ids([])).toBeNull();
  });

  it("возвращает уникальные l2_id своих категорий", () => {
    expect(
      pickActiveOrdersL2Ids([{ l2_id: "electric" }, { l2_id: "plumbing" }, { l2_id: "electric" }]),
    ).toEqual(["electric", "plumbing"]);
  });
});

describe("shouldFallbackToRatingShowcase", () => {
  it("фоллбэк только при пустом результате персонализации", () => {
    expect(shouldFallbackToRatingShowcase(0)).toBe(true);
  });

  it('"всего одна карточка" остаётся как есть — не фоллбэк', () => {
    expect(shouldFallbackToRatingShowcase(1)).toBe(false);
    expect(shouldFallbackToRatingShowcase(8)).toBe(false);
  });
});
