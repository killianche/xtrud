import { describe, expect, it } from "vitest";
import { STARTUP_SPREAD_MS, settledSince } from "./use-startup-settled";

describe("значки ждут после запуска (№278)", () => {
  it("пока не прошло полторы секунды — рано", () => {
    expect(settledSince(1_000, 1_000)).toBe(false);
    expect(settledSince(1_000, 1_000 + STARTUP_SPREAD_MS - 1)).toBe(false);
  });

  it("через полторы секунды — можно", () => {
    expect(settledSince(1_000, 1_000 + STARTUP_SPREAD_MS)).toBe(true);
  });
});
