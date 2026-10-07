/**
 * Второстепенные запросы — не в первую секунду (№278, «без VPN не работает»).
 *
 * Оба зафиксированных обрыва у владельца (2026-09-30 и 2026-10-07, записи
 * трафика и журнал nginx) случились, когда приложение сразу после
 * подключения отправляло пачку ~20 запросов за десятки миллисекунд: фильтр
 * провайдера «замораживал» соединения к серверу на 10–15 минут. Значки
 * (уведомления, новые отклики, новые задания) нужны не в первый кадр —
 * они ждут ~1,5 с после запуска, и пачка при старте вдвое меньше.
 */

import { useEffect, useState } from "react";

const APP_START = Date.now();
export const STARTUP_SPREAD_MS = 1500;

/** Прошла ли пауза после запуска `start` к моменту `now`. */
export function settledSince(start: number, now: number): boolean {
  return now - start >= STARTUP_SPREAD_MS;
}

export function startupSettled(now = Date.now()): boolean {
  return settledSince(APP_START, now);
}

export function useStartupSettled(): boolean {
  const [settled, setSettled] = useState(() => startupSettled());
  useEffect(() => {
    if (settled) return;
    const t = setTimeout(
      () => setSettled(true),
      Math.max(0, APP_START + STARTUP_SPREAD_MS - Date.now()),
    );
    return () => clearTimeout(t);
  }, [settled]);
  return settled;
}
