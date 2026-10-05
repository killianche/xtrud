import { describe, expect, it } from "vitest";
import { categoryLabel, filterSummary, placeLabel } from "./filter-summary";

const base = {
  l1Id: "",
  l2Ids: [] as string[],
  cityId: "",
  district: "",
  village: "",
  sectionName: (id: string) => ({ repair: "Ремонт и отделка" })[id],
  categoryName: (id: string) => ({ wallpaper: "Обои", tiles: "Плитка" })[id],
};

describe("filterSummary", () => {
  it("без фильтров — пусто", () => {
    expect(filterSummary(base)).toBeNull();
  });
  it("подкатегория и село с районом", () => {
    expect(
      filterSummary({
        ...base,
        l1Id: "repair",
        l2Ids: ["wallpaper"],
        district: "Назрановский район",
        village: "Экажево",
      }),
    ).toBe("Обои · Экажево, Назрановский р-н");
  });
  it("весь раздел — имя раздела", () => {
    expect(categoryLabel({ ...base, l1Id: "repair", l2Ids: ["wallpaper", "tiles"] })).toBe(
      "Ремонт и отделка",
    );
  });
  it("весь раздел из одной подкатегории — подпись разделом", () => {
    expect(
      categoryLabel({ ...base, l1Id: "repair", l2Ids: ["wallpaper"], wholeSection: true }),
    ).toBe("Ремонт и отделка");
    expect(categoryLabel({ ...base, l1Id: "repair", l2Ids: ["wallpaper"] })).toBe("Обои");
  });
  it("город и весь район", () => {
    expect(placeLabel({ ...base, cityId: "karabulak" })).toBe("Карабулак");
    expect(placeLabel({ ...base, district: "Сунженский район" })).toBe("Сунженский район");
    expect(placeLabel({ ...base, cityId: "all" })).toBeNull();
  });
});
