export interface MasterOnboardingUserSeed {
  first_name: string | null;
  last_name: string | null;
  city_id: string | null;
  district: string | null;
  contact_phone: string | null;
}

export interface MasterOnboardingProfileDraft {
  bio: string | null;
  experience_years: number | null;
  whatsapp_phone: string | null;
  whatsapp_same_as_phone: boolean | null;
}

export function masterOnboardingFormDefaults(
  user: MasterOnboardingUserSeed,
  draft: MasterOnboardingProfileDraft | null,
) {
  return {
    firstName: user.first_name ?? "",
    lastName: user.last_name ?? "",
    cityId: user.city_id ?? "",
    district: user.district ?? "",
    bio: draft?.bio ?? "",
    experienceYears: draft?.experience_years ?? 0,
    whatsappPhone: draft?.whatsapp_same_as_phone
      ? (user.contact_phone ?? "")
      : (draft?.whatsapp_phone ?? ""),
    contactPhone: user.contact_phone ?? "",
  };
}
