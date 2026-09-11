import { describe, expect, it } from "vitest";
import { orderShareMessage, orderShareUrl } from "./order-share";

const ORDER = "4f9ac7d8-5e15-4857-aa5d-fb92e9c183fb";

describe("orderShareUrl", () => {
  it("адрес сайта, а не схема приложения — его понимает любой мессенджер", () => {
    expect(orderShareUrl(ORDER)).toBe(`https://xtrud.pro/orders/${ORDER}`);
  });
});

describe("orderShareMessage", () => {
  it("название задания и ссылка отдельной строкой", () => {
    expect(orderShareMessage("  Починить кран ", ORDER)).toBe(
      `Задание в xtrud: Починить кран\nhttps://xtrud.pro/orders/${ORDER}`,
    );
  });

  it("без названия — подпись и ссылка", () => {
    expect(orderShareMessage("  ", ORDER)).toBe(
      `Задание в xtrud\nhttps://xtrud.pro/orders/${ORDER}`,
    );
    expect(orderShareMessage(null, ORDER)).toBe(
      `Задание в xtrud\nhttps://xtrud.pro/orders/${ORDER}`,
    );
  });
});
