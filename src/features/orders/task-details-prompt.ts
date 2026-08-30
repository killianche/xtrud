/**
 * Reviewed, deterministic prompts for the free-text details field.
 *
 * A category without an explicit prompt uses the generic text. This prevents
 * broad L2 categories from inventing irrelevant questions and keeps the
 * current database contract unchanged.
 */

const GENERIC_TASK_DETAILS_PROMPT = "Объём работы, особенности и что уже есть…";

const PROMPT_BY_L2: Readonly<Record<string, string>> = {
  wallpaper: "Площадь, вид обоев, нужно ли снять старые и подготовить стены…",
  windows: "Количество и размеры окон, вид работ и какие материалы уже есть…",
  doors: "Количество и размеры дверей, вид работ и какие материалы уже есть…",
  "curtains-blinds": "Количество окон, размеры, тип крепления и что уже куплено…",
  cleaning: "Площадь, что именно нужно убрать, нужен ли инвентарь или вывоз мусора…",
  "cleaning-post-renovation": "Площадь, объём мусора и что особенно важно очистить…",
  landscape: "Площадь территории, вид работ, инвентарь и нужен ли вывоз мусора…",
};

export function taskDetailsPrompt(l2Id: string | null | undefined): string {
  if (!l2Id) return GENERIC_TASK_DETAILS_PROMPT;
  return PROMPT_BY_L2[l2Id] ?? GENERIC_TASK_DETAILS_PROMPT;
}
