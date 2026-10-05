import { describe, expect, it } from "vitest";
import { categoryLabel, placeLabel } from "./filter-summary";

const base = {
  l1Id: "",
  l2Ids: [] as string[],
  cityId: "",
  district: "",
  village: "",
  sectionName: (id: string) => ({ repair: "Ремонт и отделка" })[id],
  categoryName: (id: string) => ({ wallpaper: "Обои", tiles: "Плитка" })[id],
};

describe("подписи капсул", () => {
  it("без фильтров — пусто", () => {
    expect(categoryLabel(base)).toBeNull();
    expect(placeLabel(base)).toBeNull();
  });
  it("подкатегория и село с районом", () => {
    const i = {
      ...base,
      l1Id: "repair",
      l2Ids: ["wallpaper"],
      district: "Назрановский район",
      village: "Экажево",
    };
    expect(categoryLabel(i)).toBe("Обои");
    expect(placeLabel(i)).toBe("Экажево, Назрановский р-н");
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
