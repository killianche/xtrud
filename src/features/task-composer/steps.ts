/**
 * Шаги конструктора задания — порядок, маршруты, готовность.
 *
 * DECISION владельца 2026-09-06 (вечер): «изучи, как большие компании
 * (Apple, TaskRabbit) делают форму заявки, и сделай нашу с нуля — в духе
 * Apple iOS Liquid Glass». Что взято (docs/TASK_COMPOSER.md):
 *   - один вопрос на экран (Thumbtack, TaskRabbit): человек отвечает на
 *     вопрос, а не заполняет анкету;
 *   - каждый шаг — настоящий маршрут Stack: «назад» и свайп от края — один
 *     POP, черновик жив (Apple: навигация, а не самописный визард);
 *   - «Далее» доступна только когда обязательное заполнено (Apple HIG
 *     «Entering data»: enable Next only after required data);
 *   - экран проверки, откуда можно вернуться к любому ответу (TaskRabbit:
 *     «edit and elaborate at any point»).
 *
 * Чистая логика без React — проверяется тестами.
 */

import { digitsOnly } from "@/features/auth/validation";
import type { OrderPriceKind, OrderUrgencyValue } from "@/features/orders/order-schema";

export const COMPOSER_STEPS = [
  "intent",
  "details",
  "where",
  "when",
  "budget",
  "contacts",
  "review",
] as const;
export type ComposerStep = (typeof COMPOSER_STEPS)[number];

/** Маршрут шага. Вход — `/orders/new` (его знает auth-return). */
export const COMPOSER_ROUTE: Record<ComposerStep, string> = {
  intent: "/orders/new",
  details: "/orders/new/details",
  where: "/orders/new/where",
  when: "/orders/new/when",
  budget: "/orders/new/budget",
  contacts: "/orders/new/contacts",
  review: "/orders/new/review",
};

export function nextStep(step: ComposerStep): ComposerStep | null {
  const i = COMPOSER_STEPS.indexOf(step);
  return i >= 0 && i < COMPOSER_STEPS.length - 1 ? (COMPOSER_STEPS[i + 1] ?? null) : null;
}

/** Индекс шага для индикатора: 1..N. */
export function stepPosition(step: ComposerStep): { index: number; total: number } {
  return { index: COMPOSER_STEPS.indexOf(step) + 1, total: COMPOSER_STEPS.length };
}

export interface ComposerValues {
  l2Id: string;
  title: string;
  description: string;
  cityId: string;
  district: string;
  urgency: OrderUrgencyValue | null;
  preferredDate: string | null;
  budgetKind: OrderPriceKind | null;
  budgetValue: number | null;
  contactPhone: string;
  whatsappPhone: string;
  contactName: string;
}

export const EMPTY_COMPOSER_VALUES: ComposerValues = {
  l2Id: "",
  title: "",
  description: "",
  cityId: "",
  district: "",
  urgency: null,
  preferredDate: null,
  budgetKind: null,
  budgetValue: null,
  contactPhone: "",
  whatsappPhone: "",
  contactName: "",
};

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const BUDGET_MAX = 10_000_000;

export function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

/** Телефон либо пустой (по желанию), либо настоящий номер. */
export function isPhoneAcceptable(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || digitsOnly(trimmed).length >= 10;
}

/** Готов ли шаг — по нему включается «Далее». */
export function isStepValid(step: ComposerStep, v: ComposerValues): boolean {
  switch (step) {
    case "intent":
      return normalizeTitle(v.title).length >= TITLE_MIN && v.l2Id.length > 0;
    case "details":
      return v.description.length <= DESCRIPTION_MAX;
    case "where":
      return v.cityId.length > 0 || v.district.length > 0;
    case "when":
      return v.urgency !== null && (v.urgency !== "by_date" || !!v.preferredDate);
    case "budget":
      if (v.budgetKind === null) return false;
      if (v.budgetKind === "negotiable") return true;
      return v.budgetValue !== null && v.budgetValue > 0 && v.budgetValue <= BUDGET_MAX;
    case "contacts":
      return isPhoneAcceptable(v.contactPhone) && isPhoneAcceptable(v.whatsappPhone);
    case "review":
      return isComposerComplete(v);
  }
}

/** Все обязательные ответы есть — можно публиковать. */
export function isComposerComplete(v: ComposerValues): boolean {
  return COMPOSER_STEPS.filter((s) => s !== "review").every((s) => isStepValid(s, v));
}

/** Первый незаполненный шаг — куда вести с проверки или после входа. */
export function firstIncompleteStep(v: ComposerValues): ComposerStep {
  return COMPOSER_STEPS.find((s) => s !== "review" && !isStepValid(s, v)) ?? "review";
}

/** Есть ли в черновике что-то, что жалко потерять. */
export function hasComposerContent(v: ComposerValues): boolean {
  return normalizeTitle(v.title).length > 0 || v.l2Id.length > 0 || v.description.trim().length > 0;
}

/** Сумма из ввода: только цифры, без ведущих нулей, не больше BUDGET_MAX знаков. */
export function parseBudgetInput(text: string): number | null {
  const digits = digitsOnly(text).replace(/^0+/, "").slice(0, 8);
  if (!digits) return null;
  return Number(digits);
}

export function formatBudgetInput(value: number | null): string {
  // Intl ставит узкий неразрывный пробел (U+202F); в поле ввода нужен обычный.
  return value === null
    ? ""
    : new Intl.NumberFormat("ru-RU").format(value).replace(/[\u00A0\u202F]/g, " ");
}

/** Ближайшие N дат для полосы выбора даты, ISO yyyy-mm-dd по местному времени. */
export function upcomingDates(count: number, from = new Date()): string[] {
  const out: string[] = [];
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${d.getFullYear()}-${m}-${day}`);
  }
  return out;
}
