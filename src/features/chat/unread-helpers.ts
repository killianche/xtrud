/**
 * Pure-функции для определения unread статуса чатов. Без RN/Supabase imports —
 * чтобы unit-тесты в Node (Vitest) могли подключаться без полного RN-bundle.
 */

import type { Tables } from "@/types/database";

/**
 * Есть ли непрочитанные сообщения партнёра для текущего user.
 */
export function isChatUnread(chat: Tables<"chats">, userId: string): boolean {
  if (!chat.last_message_at) return false;
  const myReadAt = chat.client_id === userId ? chat.last_read_client_at : chat.last_read_master_at;
  if (!myReadAt) return true;
  return new Date(chat.last_message_at).getTime() > new Date(myReadAt).getTime();
}

export function unreadChatsCount(
  chats: Tables<"chats">[] | undefined,
  userId: string | undefined,
): number {
  if (!chats || !userId) return 0;
  let n = 0;
  for (const c of chats) {
    if (isChatUnread(c, userId)) n++;
  }
  return n;
}
