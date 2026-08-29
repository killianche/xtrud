import { describe, expect, it } from "vitest";
import { BUNDLED_PICKER_CITIES } from "./bundled-cities";

describe("BUNDLED_PICKER_CITIES", () => {
  it("uses the current picker list without the legacy split city entries", () => {
    const ids = BUNDLED_PICKER_CITIES.map((city) => city.id);
    expect(ids).toContain("nazran-magas");
    expect(ids).not.toContain("nazran");
    expect(ids).not.toContain("magas");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
