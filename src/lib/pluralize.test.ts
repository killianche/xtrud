import { describe, expect, it } from "vitest";
import {
  pluralizeClosedDeals,
  pluralizeClosedOrders,
  pluralizeResponses,
  pluralizeReviews,
  pluralizeRu,
  pluralizeServices,
  pluralizeYears,
} from "./pluralize";

const forms = { one: "стул", few: "стула", many: "стульев" };

describe("pluralizeRu", () => {
  it("returns one form for 1, 21, 101 (but not 11)", () => {
    expect(pluralizeRu(1, forms)).toBe("стул");
    expect(pluralizeRu(21, forms)).toBe("стул");
    expect(pluralizeRu(101, forms)).toBe("стул");
    expect(pluralizeRu(11, forms)).toBe("стульев"); // exception
  });

  it("returns few form for 2-4, 22-24 (but not 12-14)", () => {
    expect(pluralizeRu(2, forms)).toBe("стула");
    expect(pluralizeRu(3, forms)).toBe("стула");
    expect(pluralizeRu(4, forms)).toBe("стула");
    expect(pluralizeRu(22, forms)).toBe("стула");
    expect(pluralizeRu(12, forms)).toBe("стульев"); // exception
    expect(pluralizeRu(13, forms)).toBe("стульев");
    expect(pluralizeRu(14, forms)).toBe("стульев");
  });

  it("returns many form for 0, 5-20", () => {
    expect(pluralizeRu(0, forms)).toBe("стульев");
    expect(pluralizeRu(5, forms)).toBe("стульев");
    expect(pluralizeRu(15, forms)).toBe("стульев");
    expect(pluralizeRu(20, forms)).toBe("стульев");
  });
});

describe("pluralize concrete words", () => {
  it("отзыв: 1, 22, 11, 5", () => {
    expect(pluralizeReviews(1)).toBe("1 отзыв");
    expect(pluralizeReviews(22)).toBe("22 отзыва");
    expect(pluralizeReviews(11)).toBe("11 отзывов");
    expect(pluralizeReviews(5)).toBe("5 отзывов");
  });

  it("год: 1, 2, 5, 12", () => {
    expect(pluralizeYears(1)).toBe("1 год");
    expect(pluralizeYears(2)).toBe("2 года");
    expect(pluralizeYears(5)).toBe("5 лет");
    expect(pluralizeYears(12)).toBe("12 лет");
  });

  it("заказ закрыт vs выполнен", () => {
    expect(pluralizeClosedDeals(1)).toBe("1 заказ выполнен");
    expect(pluralizeClosedDeals(3)).toBe("3 заказа выполнено");
    expect(pluralizeClosedDeals(10)).toBe("10 заказов выполнено");
    expect(pluralizeClosedOrders(1)).toBe("1 заказ закрыт");
    expect(pluralizeClosedOrders(3)).toBe("3 заказа закрыто");
  });

  it("услуга: 1, 2, 5, 11", () => {
    expect(pluralizeServices(1)).toBe("1 услуга");
    expect(pluralizeServices(2)).toBe("2 услуги");
    expect(pluralizeServices(5)).toBe("5 услуг");
    expect(pluralizeServices(11)).toBe("11 услуг");
  });

  it("отклик: 0 → 'Нет откликов', 1, 3, 5, 11, 22", () => {
    expect(pluralizeResponses(0)).toBe("Нет откликов");
    expect(pluralizeResponses(1)).toBe("1 отклик");
    expect(pluralizeResponses(3)).toBe("3 отклика");
    expect(pluralizeResponses(5)).toBe("5 откликов");
    expect(pluralizeResponses(11)).toBe("11 откликов");
    expect(pluralizeResponses(22)).toBe("22 отклика");
  });
});
