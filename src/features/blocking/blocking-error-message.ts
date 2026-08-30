/**
 * Пользовательский текст ошибки для блокировки/разблокировки и загрузки
 * списка заблокированных. Копирует конвенцию src/features/orders/order-publish-error.ts:
 * отличает «ответ сервера вообще не получен» (оффлайн) от «сервер отклонил
 * запрос» и никогда не показывает пользователю сырой Postgres/PostgREST
 * текст — в т.ч. «relation "user_blocks" does not exist», который реально
 * увидит любой, кто откроет экран блокировок до применения миграции 0124
 * (see use-user-blocks.ts).
 */

import { isNetworkTransportError } from "@/lib/network-transport-error";

export function blockingActionFailureMessage(error: unknown): string {
  if (isNetworkTransportError(error)) {
    return "Нет соединения с интернетом. Проверьте сеть и попробуйте снова.";
  }
  return "Сервер отклонил запрос. Попробуйте ещё раз чуть позже.";
}
