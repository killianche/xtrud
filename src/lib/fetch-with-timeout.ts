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

/**
 * Загрузка файла — другое дело: фото уходит по мобильной связи, и 12 секунд
 * ему мало. Владелец, 2026-09-12: «задание не публикуется без VPN». В логах
 * сервера запросы из России проходят, включая публикацию, — значит обрывало
 * не сетью, а нашим же таймаутом на загрузке фото.
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && input !== null && "method" in input) {
    return String((input as Request).method ?? "GET").toUpperCase();
  }
  return "GET";
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === "object" && input !== null && "url" in input) {
    return String((input as Request).url ?? "");
  }
  return "";
}

/** Сколько ждать этот запрос: загрузку файла — дольше, остальное — как раньше. */
export function timeoutForRequest(input: RequestInfo | URL, init?: RequestInit): number {
  const method = methodOf(input, init);
  const isUpload = urlOf(input).includes("/v2/files/") && method !== "GET" && method !== "HEAD";
  return isUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

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
export function createTimeoutFetch(timeoutMs?: number, fetchImpl?: FetchImpl): FetchImpl {
  return async (input, init) => {
    const impl = fetchImpl ?? (globalThis.fetch as FetchImpl);
    // Срок ответа — по типу запроса, если явный не задан.
    const limit = timeoutMs ?? timeoutForRequest(input, init);
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
        reject(createTimeoutError(limit));
      }, limit);
    });

    try {
      return await Promise.race([request, expiry]);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  };
}
