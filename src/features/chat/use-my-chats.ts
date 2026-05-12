// Hook загрузки моих чатов. JOIN на orders.title + users.first_name партнёра.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export interface MyChatWithRefs extends Tables<"chats"> {
  order: Pick<Tables<"orders">, "id" | "title" | "status"> | null;
  client: Pick<Tables<"users">, "id" | "first_name" | "last_name" | "avatar_url"> | null;
  master: Pick<Tables<"users">, "id" | "first_name" | "last_name" | "avatar_url"> | null;
}

/**
 * Есть ли непрочитанные сообщения партнёра для текущего user.
 * Используется на Tab badge и на ChatRow.
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

export function myChatsKey(userId: string | undefined) {
  return ["my-chats", userId] as const;
}

export function useMyChats(userId: string | undefined) {
  return useQuery<MyChatWithRefs[]>({
    queryKey: myChatsKey(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("chats")
        .select(
          "*, order:orders(id, title, status), client:users!chats_client_id_fkey(id, first_name, last_name, avatar_url), master:users!chats_master_id_fkey(id, first_name, last_name, avatar_url)",
        )
        .or(`client_id.eq.${userId},master_id.eq.${userId}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyChatWithRefs[];
    },
    enabled: !!userId,
    staleTime: 15_000,
  });
}
