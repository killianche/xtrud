// Таймаут для сетевых запросов приложения.
//
// Зачем (FACT, разбор скриншотов владельца 2026-09-03): у supabase-js нет
// таймаута по умолчанию, а iOS-сеть умеет «ждать связи» и не обрывать запрос.
// Если ответа нет, промис не отклоняется НИКОГДА: react-query остаётся в
// состоянии загрузки, retry не срабатывает (retry бывает только после
// отклонения), и экран показывает скелетон бесконечно. Именно это владелец
// видел на главной, в «Найти задание» и в «Исполнителях рядом»: в логах
// сервера за ту сессию нет ни одного завершённого запроса.
//
// Решение: гонка запроса с таймером. Молчащий запрос превращается в обычную
// ошибку → срабатывают состояния «ошибка/оффлайн» и встроенный офлайн-каталог
// категорий.
//
// Почему именно гонка, а не только `AbortController`: отмена сигналом
// полагается на то, что реализация fetch САМА отклонит промис. Настоящий
// fetch так и делает, но вся эта правка существует ровно потому, что запрос
// умеет зависать; полагаться в защите от зависания на добросовестность той же
// стороны — плохая ставка. Сигнал всё равно шлём: он освобождает соединение.
//
// Ошибке проставляется `code: "ETIMEDOUT"` — по нему
// `isNetworkTransportError` (src/lib/network-transport-error.ts) относит сбой
// к транспортным и разрешает подстановку встроенного каталога. Текст ошибки
// русский: он может попасть на глаза пользователю.

/** Столько ждём ответа, прежде чем считать запрос повисшим. */
export const REQUEST_TIMEOUT_MS = 12_000;

export interface TimeoutError extends Error {
  code: string;
}

export function createTimeoutError(timeoutMs: number): TimeoutError {
  const error = new Error(
    `Сервер не ответил за ${Math.round(timeoutMs / 1000)} с. Проверьте интернет и повторите.`,
  ) as TimeoutError;
  error.name = "TimeoutError";
  error.code = "ETIMEDOUT";
  return error;
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Оборачивает fetch в таймаут, сохраняя отмену вызывающей стороны
 * (`.abortSignal()` в supabase-js).
 */
export function createTimeoutFetch(
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  fetchImpl?: FetchImpl,
): FetchImpl {
  return async (input, init) => {
    const impl = fetchImpl ?? (globalThis.fetch as FetchImpl);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Отмена снаружи должна работать так же, как раньше: пробрасываем её в
    // наш контроллер. AbortSignal.any не используем — его нет в Hermes.
    const callerSignal = init?.signal;
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }

    const request = impl(input, { ...init, signal: controller.signal });
    // Если гонку выиграл таймаут, запрос всё равно когда-нибудь отклонится.
    // Гасим его отдельно, иначе это «необработанное отклонение промиса».
    request.catch(() => undefined);

    const expiry = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(createTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([request, expiry]);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  };
}
