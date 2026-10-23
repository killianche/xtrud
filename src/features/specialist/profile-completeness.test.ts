import { describe, expect, it } from "vitest";
import { computeSpecialistProfileCompleteness } from "./profile-completeness";

const FULL = { hasAvatar: true, hasBio: true, hasPortfolio: true, hasContacts: true };

describe("computeSpecialistProfileCompleteness", () => {
  it("нет категорий — gate, дробь не даёт готовности", () => {
    const result = computeSpecialistProfileCompleteness({ hasCategories: false, ...FULL });
    expect(result.hasCategories).toBe(false);
    expect(result.isGoodEnough).toBe(false);
    expect(result.nextStep).toBe("categories");
    // Все 4 пункта заполнены, но без категории это не считается «готовым».
    expect(result.doneCount).toBe(4);
  });

  it("категория есть, 0 из 4 — не готово, следующий шаг — фото", () => {
    const result = computeSpecialistProfileCompleteness({
      hasCategories: true,
      hasAvatar: false,
      hasBio: false,
      hasPortfolio: false,
      hasContacts: false,
    });
    expect(result.doneCount).toBe(0);
    expect(result.isGoodEnough).toBe(false);
    expect(result.nextStep).toBe("avatar");
  });

  it("3 из 4 — уже достаточно (75%)", () => {
    const result = computeSpecialistProfileCompleteness({
      hasCategories: true,
      hasAvatar: true,
      hasBio: true,
      hasPortfolio: true,
      hasContacts: false,
    });
    expect(result.doneCount).toBe(3);
    expect(result.isGoodEnough).toBe(true);
    expect(result.nextStep).toBe("contacts");
  });

  it("4 из 4 — готово полностью, следующего шага нет", () => {
    const result = computeSpecialistProfileCompleteness({ hasCategories: true, ...FULL });
    expect(result.doneCount).toBe(4);
    expect(result.isGoodEnough).toBe(true);
    expect(result.nextStep).toBeNull();
  });

  it("порядок пунктов — фото, о себе, фото работ, контакты", () => {
    const result = computeSpecialistProfileCompleteness({
      hasCategories: true,
      hasAvatar: true,
      hasBio: false,
      hasPortfolio: true,
      hasContacts: true,
    });
    expect(result.nextStep).toBe("bio");
  });
});
