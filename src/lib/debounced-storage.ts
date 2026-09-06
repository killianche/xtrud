// Хранилище с отложенной записью.
//
// ЗАЧЕМ (FACT, QA 2026-09-06). Черновик задания пишется в SecureStore на
// каждый набранный символ: zustand persist зовёт setItem при каждом set(),
// а largeSecureStorage режет значение на куски и делает несколько обращений к
// Keychain подряд, выстраивая их в очередь по ключу. На длинном описании
// каждая следующая буква ждала цепочку записей предыдущей — ввод мог
// ощущаться вязким на слабом iPhone.
//
// Решение: в памяти состояние обновляется сразу (это делает zustand), а на
// диск уходит только последнее значение спустя паузу. Чтение и удаление —
// без задержки; перед удалением отложенная запись отменяется, иначе она
// воскресила бы удалённый черновик.

import type { StateStorage } from "zustand/middleware";

export function createDebouncedStorage(base: StateStorage, delayMs = 400): StateStorage {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, string>();

  const flush = (name: string) => {
    const timer = timers.get(name);
    if (timer) clearTimeout(timer);
    timers.delete(name);
    const value = pending.get(name);
    pending.delete(name);
    if (value !== undefined) void base.setItem(name, value);
  };

  return {
    getItem: (name) => {
      // Если запись ещё не дошла до диска — отдаём её, а не устаревшее с диска.
      const inFlight = pending.get(name);
      return inFlight !== undefined ? inFlight : base.getItem(name);
    },
    setItem: (name, value) => {
      pending.set(name, value);
      const timer = timers.get(name);
      if (timer) clearTimeout(timer);
      timers.set(
        name,
        setTimeout(() => flush(name), delayMs),
      );
    },
    removeItem: (name) => {
      const timer = timers.get(name);
      if (timer) clearTimeout(timer);
      timers.delete(name);
      pending.delete(name);
      return base.removeItem(name);
    },
  };
}
