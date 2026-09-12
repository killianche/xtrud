import { describe, expect, it } from "vitest";
import {
  CITY_IDS_BY_DISTRICT_ID,
  cityIdsOfDistrictName,
  districtNameOfCityId,
} from "./location-config";

describe("район и его города", () => {
  it("Назрановский район включает Назрань и Магас", () => {
    expect(cityIdsOfDistrictName("Назрановский район")).toEqual([
      "nazran-magas",
      "nazran",
      "magas",
    ]);
  });

  it("Малгобек — в Малгобекском районе", () => {
    expect(districtNameOfCityId("malgobek")).toBe("Малгобекский район");
    expect(districtNameOfCityId("nazran-magas")).toBe("Назрановский район");
  });

  it("Карабулак — отдельный округ, района нет", () => {
    expect(districtNameOfCityId("karabulak")).toBeNull();
  });

  it("Джейрахский район без городов, неизвестное имя — пусто", () => {
    expect(CITY_IDS_BY_DISTRICT_ID.dzheirakhsky).toEqual([]);
    expect(cityIdsOfDistrictName("Такого района нет")).toEqual([]);
  });
});
