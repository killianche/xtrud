// Само переподключение после сбоя связи (№378).
//
// Зачем (владелец, 2026-10-30, скриншот «Не удалось загрузить» на «Ваши
// предложения»): «если я через какое-то время снова захожу, пусть он сам
// пытается переподключиться — сейчас он просто стоит, я нажимаю, и
// появляется всё». FACT: транспортный сбой react-query не повторяет
// (retry в app/_layout.tsx), refetchOnWindowFocus по умолчанию выключен,
// а onlineManager в React Native не знает о сети — экран с ошибкой ждал
// только нажатия «Повторить».
//
// Что делаем:
// 1. Возврат в приложение — сразу перезапрос всего, что показано с ошибкой
//    (`refetchErroredOnFocus` для refetchOnWindowFocus по умолчанию).
// 2. Пока приложение открыто и на экране ошибка связи — сами повторяем
//    через 5, 10, 20, затем каждые 30 с. После таймаута ждём паузу тишины
//    из fetch-with-timeout (№278): во время заморозки соединений фильтром
//    провайдера новые попытки только продлевают её.

import type { Query, QueryClient } from "@tanstack/react-query";
import { networkQuietRemainingMs } from "./fetch-with-timeout";
import { isNetworkTransportError } from "./network-transport-error";

/** Паузы между повторами; последняя повторяется, пока связь не вернётся. */
export const AUTO_RECOVER_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const;
const MAX_DELAY_MS = 30_000;

/** Запрос показан на экране и упал без ответа сервера. */
function isVisibleTransportFailure(query: Query): boolean {
  return (
    query.state.status === "error" &&
    query.state.fetchStatus === "idle" &&
    query.getObserversCount() > 0 &&
    isNetworkTransportError(query.state.error)
  );
}

/**
 * Значение refetchOnWindowFocus по умолчанию: при возврате в приложение
 * перезапрашивается только то, что сейчас показано с ошибкой.
 */
export function refetchErroredOnFocus(query: {
  state: Pick<Query["state"], "status">;
}): boolean | "always" {
  return query.state.status === "error" ? "always" : false;
}

export interface AutoRecoverOptions {
  /** Приложение на экране (AppState "active"). */
  isActive: () => boolean;
  /** Подписка на смену активности; возвращает отписку. */
  onActiveChange: (listener: (active: boolean) => void) => () => void;
  /** Для тестов. */
  quietRemainingMs?: () => number;
}

/** Запускает само переподключение; возвращает остановку. */
export function startQueryAutoRecover(client: QueryClient, opts: AutoRecoverOptions): () => void {
  const quietRemaining = opts.quietRemainingMs ?? (() => networkQuietRemainingMs());
  const cache = client.getQueryCache();
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const failing = () => cache.findAll({ predicate: isVisibleTransportFailure });

  function clear() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    if (timer !== undefined || !opts.isActive() || failing().length === 0) return;
    const step = AUTO_RECOVER_DELAYS_MS[attempt] ?? MAX_DELAY_MS;
    timer = setTimeout(run, Math.max(step, quietRemaining()));
  }

  function run() {
    timer = undefined;
    if (!opts.isActive()) return;
    if (failing().length === 0) return;
    attempt += 1;
    // Отключённые запросы refetchQueries пропускает сам. Новая ошибка придёт
    // событием кэша и назначит следующий повтор.
    void client.refetchQueries({ predicate: isVisibleTransportFailure }).catch(() => undefined);
  }

  const unsubscribeCache = cache.subscribe((event) => {
    if (event.type !== "updated") return;
    if (event.action.type === "success") {
      // Ответ пришёл — связь есть, следующий сбой начинаем с короткой паузы.
      attempt = 0;
      return;
    }
    if (event.action.type === "error") schedule();
  });

  const unsubscribeActive = opts.onActiveChange((active) => {
    clear();
    if (!active) return;
    // Возврат в приложение перезапрашивает упавшее сам (refetchErroredOnFocus);
    // здесь только начинаем отсчёт заново.
    attempt = 0;
  });

  return () => {
    clear();
    unsubscribeCache();
    unsubscribeActive();
  };
}
