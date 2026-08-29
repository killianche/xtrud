import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

import {
  validateOrderPublishCategory,
  validateOrderPublishLocation,
} from "./validate-order-publish-category";

describe("validateOrderPublishCategory", () => {
  it("accepts a current visible category returned by the backend", async () => {
    const lookup = vi.fn().mockResolvedValue({ id: "wallpaper", l1_id: "construction" });

    await expect(validateOrderPublishCategory("wallpaper", lookup)).resolves.toBe(true);
    expect(lookup).toHaveBeenCalledWith("wallpaper");
  });

  it("rejects removed and out-of-scope categories", async () => {
    await expect(validateOrderPublishCategory("wallpaper", async () => null)).resolves.toBe(false);
    await expect(
      validateOrderPublishCategory("legal-help", async () => ({
        id: "legal-help",
        l1_id: "business",
      })),
    ).resolves.toBe(false);
  });

  it("does not hide backend transport errors", async () => {
    const error = new Error("network unavailable");
    await expect(
      validateOrderPublishCategory("wallpaper", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it("does not call the backend for an empty category", async () => {
    const lookup = vi.fn();
    await expect(validateOrderPublishCategory(" ", lookup)).resolves.toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("validateOrderPublishLocation", () => {
  it("accepts only the exact active real city returned by the backend", async () => {
    await expect(
      validateOrderPublishLocation("nazran-magas", "", async () => ({ id: "nazran-magas" })),
    ).resolves.toBe(true);
    await expect(validateOrderPublishLocation("nazran-magas", "", async () => null)).resolves.toBe(
      false,
    );
  });

  it("accepts the whole republic without querying the cities table", async () => {
    const lookup = vi.fn();
    await expect(validateOrderPublishLocation("all", "", lookup)).resolves.toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("accepts a canonical district-only location without a city lookup", async () => {
    const lookup = vi.fn();
    await expect(validateOrderPublishLocation("", "Назрановский район", lookup)).resolves.toBe(
      true,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("accepts a canonical village stored in the district field", async () => {
    const lookup = vi.fn();
    await expect(validateOrderPublishLocation("", "Экажево", lookup)).resolves.toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects empty, unknown-district and mixed location states", async () => {
    const lookup = vi.fn();
    await expect(validateOrderPublishLocation("", "", lookup)).resolves.toBe(false);
    await expect(validateOrderPublishLocation("", "Несуществующий район", lookup)).resolves.toBe(
      false,
    );
    await expect(
      validateOrderPublishLocation("nazran-magas", "Назрановский район", lookup),
    ).resolves.toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not hide city lookup transport errors", async () => {
    await expect(
      validateOrderPublishLocation("nazran-magas", "", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
});
