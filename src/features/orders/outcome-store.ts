/**
 * Pure-логика outcome-tracking prompt. Без RN-imports — пригодно для Node-тестов.
 */

import { create } from "zustand";

interface OutcomeStore {
  dismissed: Record<string, number>; // orderId → unix timestamp dismissed until
  dismissFor: (orderId: string, ms: number) => void;
  isDismissed: (orderId: string) => boolean;
}

export const useOutcomeStore = create<OutcomeStore>((set, get) => ({
  dismissed: {},
  dismissFor: (orderId, ms) =>
    set((s) => ({
      dismissed: { ...s.dismissed, [orderId]: Date.now() + ms },
    })),
  isDismissed: (orderId) => (get().dismissed[orderId] ?? 0) > Date.now(),
}));

export const PROMPT_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 дня
export const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

interface ShouldShowOutcomePromptOpts {
  isOwner: boolean;
  orderStatus: string;
  pickedMasterId: string | null;
  updatedAt: string;
  orderId: string;
  /** Override "сейчас" — для тестов. По умолчанию Date.now(). */
  now?: number;
  /** Override isDismissed — для тестов. */
  isDismissed?: (orderId: string) => boolean;
}

/**
 * @returns true если modal нужно показать клиенту прямо сейчас.
 */
export function shouldShowOutcomePrompt(opts: ShouldShowOutcomePromptOpts): boolean {
  if (!opts.isOwner) return false;
  if (opts.orderStatus !== "in_progress") return false;
  if (!opts.pickedMasterId) return false;
  const updated = new Date(opts.updatedAt).getTime();
  if (Number.isNaN(updated)) return false;
  const now = opts.now ?? Date.now();
  if (now - updated < PROMPT_THRESHOLD_MS) return false;
  const isDismissed = opts.isDismissed ?? ((id) => useOutcomeStore.getState().isDismissed(id));
  if (isDismissed(opts.orderId)) return false;
  return true;
}
