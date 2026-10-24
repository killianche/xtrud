import { describe, expect, it } from "vitest";
import { computeSpecialistProfileCompleteness } from "./profile-completeness";
import {
  fillPrimaryLabel,
  fillStartHref,
  fillStepLabel,
  nextFillHref,
  parseFillFlow,
} from "./profile-fill-flow";

describe("пошаговое заполнение профиля (№362)", () => {
  it("шаги — все незаполненные пункты по порядку, категории первыми", () => {
    const r = computeSpecialistProfileCompleteness({
      hasCategories: false,
      hasAvatar: true,
      hasBio: false,
      hasPortfolio: true,
      hasContacts: false,
    });
    expect(r.missingSteps).toEqual(["categories", "bio", "contacts"]);
  });

  it("первый шаг открывает его экран с полным списком", () => {
    expect(fillStartHref(["avatar", "bio", "contacts"])).toEqual({
      pathname: "/profile/specialist/photo",
      params: { fill: "avatar,bio,contacts", fillOf: "3" },
    });
    expect(fillStartHref([])).toBeNull();
  });

  it("номер шага считается от исходного числа шагов", () => {
    const flow = parseFillFlow("bio,contacts", "3");
    expect(flow).toEqual({ steps: ["bio", "contacts"], number: 2, total: 3 });
    expect(flow && fillStepLabel(flow)).toBe("Шаг 2 из 3");
  });

  it("«Далее» ведёт на следующий шаг, после последнего — выход", () => {
    const flow = parseFillFlow("bio,contacts", "3");
    expect(flow && nextFillHref(flow)).toEqual({
      pathname: "/profile/specialist/contacts",
      params: { fill: "contacts", fillOf: "3" },
    });
    const last = parseFillFlow("contacts", "3");
    expect(last && nextFillHref(last)).toBeNull();
  });

  it("экран, открытый не из заполнения или с мусором в параметрах, — не шаг", () => {
    expect(parseFillFlow(undefined, undefined)).toBeNull();
    expect(parseFillFlow("bio", undefined)).toBeNull();
    expect(parseFillFlow("bio,contacts", "1")).toBeNull();
    expect(parseFillFlow("nonsense", "2")).toBeNull();
  });
});

describe("подпись главной кнопки шага", () => {
  it("«Далее», пока есть следующий шаг, на последнем — «Готово»", () => {
    const mid = parseFillFlow("bio,contacts", "3");
    const last = parseFillFlow("contacts", "3");
    expect(mid && fillPrimaryLabel(mid)).toBe("Далее");
    expect(last && fillPrimaryLabel(last)).toBe("Готово");
  });
});
