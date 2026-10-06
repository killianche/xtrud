import { describe, expect, it } from "vitest";
import { DISTRICTS } from "@/lib/location-config";
import { searchPlaces } from "./place-search";

describe("searchPlaces", () => {
  it("село находится сразу, с районом подписью", () => {
    const district = DISTRICTS.find((d) => d.villages.includes("Экажево"));
    expect(searchPlaces("экаж")).toContainEqual({
      kind: "village",
      title: "Экажево",
      subtitle: district?.name,
      cityId: "",
      district: district?.name,
      village: "Экажево",
    });
  });

  it("город и район — по началу слова, без учёта регистра", () => {
    expect(searchPlaces("НАЗ").map((r) => r.kind)).toEqual(
      expect.arrayContaining(["city", "district"]),
    );
    expect(searchPlaces("район")).toEqual([]);
  });

  it("пустой запрос — пусто", () => {
    expect(searchPlaces("  ")).toEqual([]);
  });
});
