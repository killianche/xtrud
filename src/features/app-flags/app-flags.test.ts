import { describe, expect, it } from "vitest";
import { parseAppFlags } from "./app-flags";

describe("parseAppFlags", () => {
  it("classic — только если так и сказано; иначе новый экран", () => {
    expect(parseAppFlags({ find_screen: "classic" }).findScreen).toBe("classic");
    expect(parseAppFlags({ find_screen: "category_first" }).findScreen).toBe("category_first");
    expect(parseAppFlags({ find_screen: "что-то" }).findScreen).toBe("category_first");
    expect(parseAppFlags(null).findScreen).toBe("category_first");
  });
});
