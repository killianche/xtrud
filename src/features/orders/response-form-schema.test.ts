import { describe, expect, it } from "vitest";
import { responseFormSchema } from "./response-form-schema";

const validResponse = {
  leadTime: "2 дня",
  contactPhone: "+7 928 111-22-33",
  whatsappPhone: "",
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

  it("принимает отклик без сообщения", () => {
    // DECISION владельца 2026-09-01: отклик — это «готов» плюс цена, срок и
    // контакты. Раньше требовалось минимум 10 символов текста, и проверка
    // держала именно тот контракт.
    expect(responseFormSchema.safeParse({ ...validResponse, message: "" }).success).toBe(true);
    expect(responseFormSchema.safeParse({ ...validResponse, message: "     " }).success).toBe(true);
  });

  it("не принимает отклик без срока", () => {
    // Срок стал обязательным вместо текста: без него клиент не может выбрать
    // между откликами, а «когда сможете» — половина решения.
    const result = responseFormSchema.safeParse({ ...validResponse, leadTime: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["leadTime"] }));
    }
  });

  it("не принимает слишком длинное сообщение", () => {
    // Верхняя граница осталась и в схеме, и в базе (миграция 0146):
    // это защита от мегабайта текста, а не продуктовое требование.
    expect(
      responseFormSchema.safeParse({ ...validResponse, message: "x".repeat(1001) }).success,
    ).toBe(false);
  });

  it("rejects a price outside the PostgreSQL integer range", () => {
    expect(
      responseFormSchema.safeParse({ ...validResponse, priceValue: 2_147_483_648 }).success,
    ).toBe(false);
  });

  it("не принимает отклик без единого контакта", () => {
    // Клиенту нужно куда-то написать: хотя бы телефон или WhatsApp.
    const r = responseFormSchema.safeParse({
      ...validResponse,
      contactPhone: "",
      whatsappPhone: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues).toContainEqual(expect.objectContaining({ path: ["contactPhone"] }));
    }
  });

  it("принимает отклик только с WhatsApp", () => {
    expect(
      responseFormSchema.safeParse({
        ...validResponse,
        contactPhone: "",
        whatsappPhone: "+7 928 000-00-00",
      }).success,
    ).toBe(true);
  });

  it("не принимает обрывок номера как контакт", () => {
    const r = responseFormSchema.safeParse({
      ...validResponse,
      contactPhone: "+7 9",
      whatsappPhone: "",
    });
    expect(r.success).toBe(false);
  });
});
