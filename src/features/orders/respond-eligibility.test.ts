import { describe, expect, it } from "vitest";
import { parseEligibility } from "./respond-eligibility";

describe("parseEligibility", () => {
  it("разрешено, если сервер не сказал иначе", () => {
    expect(parseEligibility(null).allowed).toBe(true);
    expect(parseEligibility({ allowed: true }).allowed).toBe(true);
  });
  it("запрет с категорией, которую нужно добавить", () => {
    expect(
      parseEligibility({ allowed: false, l2_id: "tiling", l2_name: "Плитка и мозаика" }),
    ).toEqual({ allowed: false, categoryId: "tiling", categoryName: "Плитка и мозаика" });
  });
});
