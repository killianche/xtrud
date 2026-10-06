import { describe, expect, it } from "vitest";
import { parseAppFlags } from "./app-flags";

describe("parseAppFlags", () => {
  it("старый сервер без новых ключей — прежнее поведение", () => {
    expect(parseAppFlags({ find_screen: "category_first" })).toEqual({
      findTiles: "grid",
      requireLogin: false,
      composerStart: "quick",
      composerForm: "single",
    });
    expect(parseAppFlags(null)).toEqual({
      findTiles: "grid",
      requireLogin: false,
      composerStart: "quick",
      composerForm: "single",
    });
  });
  it("мозаика и обязательный вход — только явным значением", () => {
    expect(parseAppFlags({ find_tiles: "mosaic", require_login: true })).toEqual({
      findTiles: "mosaic",
      requireLogin: true,
      composerStart: "quick",
      composerForm: "single",
    });
    expect(parseAppFlags({ find_tiles: "list", require_login: "true" })).toEqual({
      findTiles: "grid",
      requireLogin: false,
      composerStart: "quick",
      composerForm: "single",
    });
  });
  it('прежний каталог первым экраном — только явным "catalog" (откат №242)', () => {
    expect(parseAppFlags({ composer_start: "catalog" }).composerStart).toBe("catalog");
    expect(parseAppFlags({ composer_start: "list" }).composerStart).toBe("quick");
  });
  it('форма одним экраном (№249) — умолчание "single", откат — только явным "steps"', () => {
    expect(parseAppFlags({}).composerForm).toBe("single");
    expect(parseAppFlags({ composer_form: "steps" }).composerForm).toBe("steps");
    expect(parseAppFlags({ composer_form: "single" }).composerForm).toBe("single");
    expect(parseAppFlags({ composer_form: "other" }).composerForm).toBe("single");
  });
});
