/**
 * Заполненность профиля специалиста — общая метрика для карточки на главной
 * (`SpecialistProfileNudge`) и для вкладки профиля (`AccountBody`).
 * docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §4.1.
 *
 * Категория — отдельный gate, а не часть дроби «N из 4»: без категории
 * профиля нет в каталоге вообще, и считать его «готовым» без категории было
 * бы ошибкой приоритета. Порядок остальных пунктов — по влиянию на доверие
 * клиента (фото → о себе → фото работ → контакты, Thumbtack-референс).
 * Порог «достаточно» — 3 из 4 (75%): требовать 100% означало бы бесконечно
 * напоминать про последний необязательный пункт — шум без пользы
 * (design-quality §1.1).
 *
 * Только чистая функция и типы — без хуков. Хук-обёртка
 * (`useSpecialistProfileCompleteness`) живёт в соседнем
 * `use-specialist-profile-completeness.ts`: она тянет `@/lib/supabase`, а
 * тот — `react-native` (AppState/Platform), который vitest не умеет
 * парсить (Flow-синтаксис в `node_modules/react-native/index.js`). Если
 * хук жил бы в этом же файле, юнит-тест чистой функции падал бы уже на
 * импорте модуля (поправка исполнителя, см. §6 документа).
 */

export type CompletenessInput = {
  hasCategories: boolean;
  /** users.avatar_url — реальное фото, не генерированная заглушка. */
  hasAvatar: boolean;
  /** master_profiles.bio, trim().length > 0. */
  hasBio: boolean;
  /** хотя бы одно фото работ (useMasterPortfolio). */
  hasPortfolio: boolean;
  /** users.contact_phone || master_profiles.whatsapp_phone. */
  hasContacts: boolean;
};

/** Один из 4 необязательных пунктов дроби, либо "categories" — gate до них. */
export type SpecialistProfileStep = "avatar" | "bio" | "portfolio" | "contacts";

export type Completeness = {
  hasCategories: boolean;
  /** 0..4 — считается ТОЛЬКО по необязательным пунктам. */
  doneCount: number;
  total: 4;
  /** >= 3 из 4 (75%) И hasCategories. */
  isGoodEnough: boolean;
  nextStep: "categories" | SpecialistProfileStep | null;
  /** Все незаполненные пункты по порядку — шаги заполнения (№362). */
  missingSteps: Array<"categories" | SpecialistProfileStep>;
};

/** Порядок пунктов по влиянию на доверие клиента (§4.1). */
const STEPS: ReadonlyArray<{
  key: SpecialistProfileStep;
  done: (i: CompletenessInput) => boolean;
}> = [
  { key: "avatar", done: (i) => i.hasAvatar },
  { key: "bio", done: (i) => i.hasBio },
  { key: "portfolio", done: (i) => i.hasPortfolio },
  { key: "contacts", done: (i) => i.hasContacts },
];

/** Куда ведёт кнопка «Заполнить профиль» / «Выбрать категории». */
export const SPECIALIST_PROFILE_STEP_ROUTE: Record<"categories" | SpecialistProfileStep, string> = {
  categories: "/profile/specialist/categories",
  avatar: "/profile/specialist/photo",
  bio: "/profile/specialist/about",
  portfolio: "/profile/specialist/photos",
  contacts: "/profile/specialist/contacts",
};

export function computeSpecialistProfileCompleteness(input: CompletenessInput): Completeness {
  const doneCount = STEPS.filter((s) => s.done(input)).length;
  const missing = STEPS.filter((s) => !s.done(input)).map((s) => s.key);
  if (!input.hasCategories) {
    // Нечего делить на готовность, пока профиль не может быть найден в каталоге.
    return {
      hasCategories: false,
      doneCount,
      total: 4,
      isGoodEnough: false,
      nextStep: "categories",
      missingSteps: ["categories", ...missing],
    };
  }
  return {
    hasCategories: true,
    doneCount,
    total: 4,
    isGoodEnough: doneCount >= 3,
    nextStep: missing[0] ?? null,
    missingSteps: missing,
  };
}
