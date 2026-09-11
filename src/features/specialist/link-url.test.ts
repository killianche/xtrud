import { describe, expect, it } from "vitest";
import { LINK_MAX, linkLabel, normalizeLinkUrl } from "./link-url";

describe("normalizeLinkUrl", () => {
  it("пустое поле — ссылки нет", () => {
    expect(normalizeLinkUrl("   ")).toBeNull();
  });

  it("без схемы — дописывает https", () => {
    expect(normalizeLinkUrl(" instagram.com/ivan ")).toBe("https://instagram.com/ivan");
  });

  it("http и https оставляет как есть", () => {
    expect(normalizeLinkUrl("http://site.ru")).toBe("http://site.ru");
    expect(normalizeLinkUrl("https://vk.com/ivan?x=1")).toBe("https://vk.com/ivan?x=1");
  });

  it("не ссылка — undefined", () => {
    expect(normalizeLinkUrl("мой профиль")).toBeUndefined();
    expect(normalizeLinkUrl("ivan")).toBeUndefined();
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeLinkUrl(`https://a.ru/${"x".repeat(LINK_MAX)}`)).toBeUndefined();
  });
});

describe("linkLabel", () => {
  it("показывает без схемы, www и хвостового слеша", () => {
    expect(linkLabel("https://www.instagram.com/ivan/")).toBe("instagram.com/ivan");
    expect(linkLabel("https://site.ru")).toBe("site.ru");
  });
});
