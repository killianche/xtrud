import { isNetworkTransportError } from "@/lib/network-transport-error";

/** Форма ошибки нашего клиента (`ApiError`) в объёме, нужном для сообщения. */
interface PublishFailure {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  status?: unknown;
}

/** Сообщение сервера, если оно есть и уже написано для человека. */
function serverMessage(error: PublishFailure): string | null {
  const message = error.message;
  return typeof message === "string" && message.length > 0 ? message : null;
}

export function orderPublishFailureMessage(error: unknown): string {
  if (isNetworkTransportError(error)) {
    return "Черновик сохранён на устройстве. Публикация доступна после восстановления соединения.";
  }
  const failure = (error ?? {}) as PublishFailure;
  const details = failure.details;

  // Серверные лимиты (0175): «одно задание в день», «не больше трёх активных».
  // Ограниченный аккаунт (guard_content_author_active): «обратитесь в поддержку».
  // Во всех трёх случаях текст сервера уже на русском и точнее нашего.
  if (details === "daily_limit" || details === "active_limit" || details === "account_not_active") {
    const message = serverMessage(failure);
    if (message !== null) return message;
  }

  // Про вход говорим только тогда, когда дело действительно во входе:
  // истёкший или чужой токен (401/PGRST301) и «аккаунт не найден» из гварда.
  if (failure.status === 401 || failure.code === "PGRST301" || details === "account_unknown") {
    return "Сессия истекла. Войдите в аккаунт заново и повторите.";
  }

  // Всё остальное — сбой на нашей стороне. Не сваливаем его на пользователя
  // и не утверждаем причину, которой не знаем (design-quality §5).
  return "Не удалось опубликовать задание. Попробуйте ещё раз.";
}
