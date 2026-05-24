/**
 * Auth return-URL store (2026-05-20).
 *
 * Запоминает куда вернуть пользователя после auth-flow.
 * Use case: клиент кликнул «Откликнуться» на чужом заказе → переключение в
 * master-режим через регистрацию/онбординг → после finalize возврат на тот
 * же заказ.
 *
 * Zustand store без persistence — return-URL живёт только в текущей сессии,
 * перезагрузка → сбрасывается. Это нормально: если юзер закрыл app
 * посередине, всё равно идёт по дефолтному pathу.
 */

import { create } from "zustand";

interface AuthReturnUrlState {
  returnUrl: string | null;
  setReturnUrl: (url: string | null) => void;
  consumeReturnUrl: () => string | null;
}

export const useAuthReturnUrlStore = create<AuthReturnUrlState>((set, get) => ({
  returnUrl: null,
  setReturnUrl: (url) => set({ returnUrl: url }),
  /** Возвращает url и сразу очищает (одноразовое использование). */
  consumeReturnUrl: () => {
    const current = get().returnUrl;
    if (current) set({ returnUrl: null });
    return current;
  },
}));
