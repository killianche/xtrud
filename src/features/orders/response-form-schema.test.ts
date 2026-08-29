import { describe, expect, it } from "vitest";
import { responseFormSchema } from "./response-form-schema";

const validResponse = {
  leadTime: "2 дня",
  message: "Здравствуйте, готов выполнить это задание.",
  priceKind: "fixed" as const,
  priceValue: 5_000,
};

describe("responseFormSchema", () => {
  it.each(["fixed", "from", "up_to"] as const)(
    "requires a positive amount for %s price",
    (priceKind) => {
      expect(
        responseFormSchema.safeParse({ ...validResponse, priceKind, priceValue: null }).success,
      ).toBe(false);
      expect(
        responseFormSchema.safeParse({ ...validResponse, priceKind, priceValue: 0 }).success,
      ).toBe(false);
      expect(
        responseFormSchema.safeParse({ ...validResponse, priceKind, priceValue: -1 }).success,
      ).toBe(false);
      expect(
        responseFormSchema.safeParse({ ...validResponse, priceKind, priceValue: 1 }).success,
      ).toBe(true);
    },
  );

  it("allows a null amount for a negotiable price", () => {
    expect(
      responseFormSchema.safeParse({
        ...validResponse,
        priceKind: "negotiable",
        priceValue: null,
      }).success,
    ).toBe(true);
  });

  it("attaches the missing amount error to priceValue", () => {
    const result = responseFormSchema.safeParse({
      ...validResponse,
      priceKind: "up_to",
      priceValue: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ message: "Укажите сумму больше 0", path: ["priceValue"] }),
      );
    }
  });

  it("rejects a message made only of whitespace", () => {
    expect(
      responseFormSchema.safeParse({ ...validResponse, message: "            " }).success,
    ).toBe(false);
  });

  it("rejects a price outside the PostgreSQL integer range", () => {
    expect(
      responseFormSchema.safeParse({ ...validResponse, priceValue: 2_147_483_648 }).success,
    ).toBe(false);
  });
});
