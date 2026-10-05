import { describe, expect, it } from "vitest";
import { parseAppFlags } from "./app-flags";

describe("parseAppFlags", () => {
  it("старый сервер без новых ключей — прежнее поведение", () => {
    expect(parseAppFlags({ find_screen: "category_first" })).toEqual({
      findTiles: "grid",
      requireLogin: false,
      composerStart: "quick",
    });
    expect(parseAppFlags(null)).toEqual({
      findTiles: "grid",
      requireLogin: false,
      composerStart: "quick",
    });
  });
  it("мозаика и обязательный вход — только явным значением", () => {
    expect(parseAppFlags({ find_tiles: "mosaic", require_login: true })).toEqual({
      findTiles: "mosaic",
      requireLogin: true,
      composerStart: "quick",
    });
    expect(parseAppFlags({ find_tiles: "list", require_login: "true" })).toEqual({
      findTiles: "grid",
      requireLogin: false,
      composerStart: "quick",
    });
  });
  it('прежний каталог первым экраном — только явным "catalog" (откат №242)', () => {
    expect(parseAppFlags({ composer_start: "catalog" }).composerStart).toBe("catalog");
    expect(parseAppFlags({ composer_start: "list" }).composerStart).toBe("quick");
  });
});
