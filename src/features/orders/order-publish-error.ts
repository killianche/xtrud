import { isNetworkTransportError } from "@/lib/network-transport-error";

export function orderPublishFailureMessage(error: unknown): string {
  if (isNetworkTransportError(error)) {
    return "Черновик сохранён на устройстве. Публикация доступна после восстановления соединения.";
  }
  // Серверные лимиты (0175): «одно задание в день», «не больше трёх
  // активных» — сообщение уже на русском, показываем как есть.
  const details = (error as { details?: unknown } | null)?.details;
  if (details === "daily_limit" || details === "active_limit") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Сервер отклонил публикацию. Проверьте вход в аккаунт и повторите попытку.";
}
