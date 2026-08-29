import { isNetworkTransportError } from "@/lib/network-transport-error";

export function orderPublishFailureMessage(error: unknown): string {
  if (isNetworkTransportError(error)) {
    return "Черновик сохранён на устройстве. Публикация доступна после восстановления соединения.";
  }
  return "Сервер отклонил публикацию. Проверьте вход в аккаунт и повторите попытку.";
}
