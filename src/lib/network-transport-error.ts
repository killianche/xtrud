const TRANSPORT_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

const TRANSPORT_MESSAGE_MARKERS = [
  "network request failed",
  "failed to fetch",
  "network unavailable",
  "internet connection appears to be offline",
  "no such host",
  "no such record",
  "dns",
  "connection refused",
  "connection reset",
  "timed out",
  "timeout",
];

/**
 * Narrow classifier for failures where a server response was never obtained.
 * PostgREST/auth/contract errors carry their own codes and must remain visible;
 * they are never converted into an offline catalogue success.
 */
export function isNetworkTransportError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  if (TRANSPORT_CODES.has(code)) return true;
  if (code.length > 0) return false;

  const text = [record.message, record.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase("en-US");
  return TRANSPORT_MESSAGE_MARKERS.some((marker) => text.includes(marker));
}

/**
 * Запрос повис и оборван таймаутом (fetch-with-timeout или системным). Такой
 * сбой react-query сразу не повторяет: каждая попытка — ещё 12 с ожидания
 * (№378).
 */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  if (typeof record.code === "string" && record.code.toUpperCase() === "ETIMEDOUT") return true;
  return typeof record.message === "string" && /timed out/i.test(record.message);
}
