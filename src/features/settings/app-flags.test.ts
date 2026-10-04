import { describe, expect, it } from "vitest";
import { parseAppFlags } from "./app-flags";

describe("parseAppFlags", () => {
  it("старый сервер без новых ключей — прежнее поведение", () => {
    expect(parseAppFlags({ find_screen: "category_first" })).toEqual({
      findTiles: "grid",
      requireLogin: false,
    });
    expect(parseAppFlags(null)).toEqual({ findTiles: "grid", requireLogin: false });
  });
  it("мозаика и обязательный вход — только явным значением", () => {
    expect(parseAppFlags({ find_tiles: "mosaic", require_login: true })).toEqual({
      findTiles: "mosaic",
      requireLogin: true,
    });
    expect(parseAppFlags({ find_tiles: "list", require_login: "true" })).toEqual({
      findTiles: "grid",
      requireLogin: false,
    });
  });
});
