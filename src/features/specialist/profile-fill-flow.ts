/**
 * Пошаговое заполнение профиля специалиста из карточки «Вы специалист?»
 * (№362). Кнопка открывает первый незаполненный пункт, «Далее» сохраняет и
 * открывает следующий, «Пропустить» — следующий без сохранения; после
 * последнего человек возвращается туда, откуда начал. Раньше каждый экран
 * после сохранения закрывался, и заполнить профиль можно было только по
 * одному пункту за заход (владелец, 2026-10-24).
 *
 * Состояние шага живёт в параметрах маршрута: `fill` — оставшиеся шаги,
 * включая текущий, через запятую; `fillOf` — сколько шагов было в начале.
 * Экраны сменяют друг друга через replace, поэтому «назад» выходит из
 * заполнения целиком, а уже сохранённое остаётся сохранённым.
 *
 * Только чистые функции: хук с роутером — в `use-profile-fill-flow.ts`
 * (vitest не импортирует react-native, см. profile-completeness.ts).
 */

import {
  SPECIALIST_PROFILE_STEP_ROUTE,
  type SpecialistProfileStep,
} from "@/features/specialist/profile-completeness";

export type FillStep = "categories" | SpecialistProfileStep;

export type FillFlow = {
  /** Оставшиеся шаги, первый — текущий. */
  steps: FillStep[];
  /** Номер текущего шага, с 1. */
  number: number;
  total: number;
};

export type FillHref = {
  pathname: string;
  params: { fill: string; fillOf: string };
};

const KNOWN = new Set<string>(Object.keys(SPECIALIST_PROFILE_STEP_ROUTE));

/** Маршрут первого шага для списка шагов; null — заполнять нечего. */
export function fillStartHref(steps: FillStep[]): FillHref | null {
  return hrefFor(steps, steps.length);
}

/** Разобрать параметры маршрута; null — экран открыт не из заполнения. */
export function parseFillFlow(fill?: string, fillOf?: string): FillFlow | null {
  if (!fill) return null;
  const steps = fill.split(",").filter((s): s is FillStep => KNOWN.has(s));
  const total = Number(fillOf);
  if (steps.length === 0 || !Number.isInteger(total) || total < steps.length) return null;
  return { steps, number: total - steps.length + 1, total };
}

/** Маршрут следующего шага; null — текущий шаг последний. */
export function nextFillHref(flow: FillFlow): FillHref | null {
  return hrefFor(flow.steps.slice(1), flow.total);
}

/** «Готово» на последнем шаге: дальше ничего нет, экран закрывается (QA №362). */
export function fillPrimaryLabel(flow: FillFlow): string {
  return flow.number === flow.total ? "Готово" : "Далее";
}

export function fillStepLabel(flow: FillFlow): string {
  return `Шаг ${flow.number} из ${flow.total}`;
}

function hrefFor(steps: FillStep[], total: number): FillHref | null {
  const first = steps[0];
  if (!first) return null;
  return {
    pathname: SPECIALIST_PROFILE_STEP_ROUTE[first],
    params: { fill: steps.join(","), fillOf: String(total) },
  };
}
