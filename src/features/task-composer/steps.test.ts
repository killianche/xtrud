import { describe, expect, it } from "vitest";
import {
  COMPOSER_STEPS,
  EMPTY_COMPOSER_VALUES,
  effectiveWhatsapp,
  firstIncompleteStep,
  formatBudgetInput,
  hasComposerContent,
  isComposerComplete,
  isStepValid,
  nextStep,
  parseBudgetInput,
  stepPosition,
  upcomingDates,
} from "./steps";

const complete = {
  ...EMPTY_COMPOSER_VALUES,
  l2Id: "plumbing",
  title: "Заменить смеситель",
  cityId: "nazran-magas",
  urgency: "this_week" as const,
  budgetKind: "up_to" as const,
  budgetValue: 2500,
};

describe("composer steps", () => {
  it("идёт по порядку и заканчивается проверкой", () => {
    expect(nextStep("category")).toBe("title");
    expect(nextStep("title")).toBe("details");
    expect(nextStep("review")).toBeNull();
    expect(stepPosition("where")).toEqual({ index: 4, total: COMPOSER_STEPS.length });
  });

  it("категория — первый шаг, название — второй", () => {
    expect(isStepValid("category", EMPTY_COMPOSER_VALUES)).toBe(false);
    expect(isStepValid("category", { ...EMPTY_COMPOSER_VALUES, l2Id: "x" })).toBe(true);
    expect(isStepValid("title", { ...EMPTY_COMPOSER_VALUES, title: "Кран" })).toBe(false);
    expect(isStepValid("title", { ...EMPTY_COMPOSER_VALUES, title: "Починить кран" })).toBe(true);
  });

  it("«К дате» без даты не готов; бюджет требует сумму, кроме договорной", () => {
    expect(isStepValid("when", { ...complete, urgency: "by_date", preferredDate: null })).toBe(
      false,
    );
    expect(
      isStepValid("when", { ...complete, urgency: "by_date", preferredDate: "2026-09-10" }),
    ).toBe(true);
    expect(isStepValid("budget", { ...complete, budgetKind: "fixed", budgetValue: null })).toBe(
      false,
    );
    expect(
      isStepValid("budget", { ...complete, budgetKind: "negotiable", budgetValue: null }),
    ).toBe(true);
  });

  it("связь: отклики — без номера; напрямую — нужен хотя бы один номер", () => {
    expect(isStepValid("contacts", complete)).toBe(true);
    expect(isStepValid("contacts", { ...complete, contactMode: "phone_open" })).toBe(false);
    expect(
      isStepValid("contacts", {
        ...complete,
        contactMode: "phone_open",
        whatsappPhone: "+7 928 123-45-67",
      }),
    ).toBe(true);
    expect(
      isStepValid("contacts", { ...complete, contactMode: "phone_open", contactPhone: "123" }),
    ).toBe(false);
  });

  it("полнота и первый незаполненный шаг", () => {
    expect(isComposerComplete(complete)).toBe(true);
    expect(isComposerComplete(EMPTY_COMPOSER_VALUES)).toBe(false);
    expect(firstIncompleteStep({ ...complete, cityId: "", district: "" })).toBe("where");
    expect(firstIncompleteStep(complete)).toBe("review");
  });

  it("черновик с содержимым и без", () => {
    expect(hasComposerContent(EMPTY_COMPOSER_VALUES)).toBe(false);
    expect(hasComposerContent({ ...EMPTY_COMPOSER_VALUES, title: "  " })).toBe(false);
    expect(hasComposerContent({ ...EMPTY_COMPOSER_VALUES, l2Id: "x" })).toBe(true);
  });

  it("сумма: только цифры, формат с пробелами", () => {
    expect(parseBudgetInput("2 500 ₽")).toBe(2500);
    expect(parseBudgetInput("0")).toBeNull();
    expect(parseBudgetInput("")).toBeNull();
    expect(formatBudgetInput(12500)).toBe("12 500");
  });

  it("даты идут подряд от сегодня в местном времени", () => {
    const dates = upcomingDates(3, new Date(2026, 8, 30));
    expect(dates).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});
