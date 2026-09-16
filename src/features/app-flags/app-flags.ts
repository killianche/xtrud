/** Флаги интерфейса из админки (0205) — чистая часть, без сети. */

export type FindScreenVariant = "category_first" | "classic";

export interface AppFlags {
  findScreen: FindScreenVariant;
}

export const DEFAULT_APP_FLAGS: AppFlags = { findScreen: "category_first" };

export function parseAppFlags(data: unknown): AppFlags {
  const raw = (data ?? {}) as { find_screen?: unknown };
  return {
    findScreen: raw.find_screen === "classic" ? "classic" : "category_first",
  };
}
