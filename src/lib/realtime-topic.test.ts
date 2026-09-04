import { describe, expect, it } from "vitest";
import { uniqueRealtimeTopic } from "./realtime-topic";

describe("uniqueRealtimeTopic", () => {
  it("никогда не повторяет имя — иначе библиотека вернёт живой канал", () => {
    // Это и есть суть правки: два подряд вызова с одним префиксом обязаны
    // дать разные имена, иначе повторная подписка снова уронит приложение.
    const topics = new Set(
      Array.from({ length: 500 }, () => uniqueRealtimeTopic("my-responses:user-1")),
    );
    expect(topics.size).toBe(500);
  });

  it("сохраняет префикс — по имени видно, что за подписка", () => {
    expect(uniqueRealtimeTopic("feed:user-1").startsWith("feed:user-1#")).toBe(true);
  });

  it("не путает подписки разных людей", () => {
    const first = uniqueRealtimeTopic("feed:user-1");
    const second = uniqueRealtimeTopic("feed:user-2");
    expect(first).not.toBe(second);
    expect(first.startsWith("feed:user-1#")).toBe(true);
    expect(second.startsWith("feed:user-2#")).toBe(true);
  });
});
