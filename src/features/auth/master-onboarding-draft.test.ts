import { describe, expect, it } from "vitest";
import { masterOnboardingFormDefaults } from "./master-onboarding-draft";

const user = {
  first_name: "Иван",
  last_name: "Петров",
  city_id: "city-1",
  district: "Центр",
  contact_phone: "+79990001122",
};

describe("masterOnboardingFormDefaults", () => {
  it("restores every persisted master draft field", () => {
    expect(
      masterOnboardingFormDefaults(user, {
        bio: "Опытный мастер",
        experience_years: 7,
        whatsapp_phone: "+79993334455",
        whatsapp_same_as_phone: false,
      }),
    ).toMatchObject({
      bio: "Опытный мастер",
      experienceYears: 7,
      whatsappPhone: "+79993334455",
      contactPhone: "+79990001122",
    });
  });

  it("preserves same-as-contact WhatsApp semantics", () => {
    expect(
      masterOnboardingFormDefaults(user, {
        bio: null,
        experience_years: null,
        whatsapp_phone: null,
        whatsapp_same_as_phone: true,
      }).whatsappPhone,
    ).toBe("+79990001122");
  });
});
