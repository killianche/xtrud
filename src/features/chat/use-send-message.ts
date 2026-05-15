// Mutation: отправка сообщения в чат (текст + опц. фото-attachment, P0-6).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatMessagesKey } from "@/features/chat/use-chat-messages";
import { myChatsKey } from "@/features/chat/use-my-chats";
import { supabase } from "@/lib/supabase";

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  /** Текст сообщения. Может быть пустым если задан imageUri. */
  text: string;
  /**
   * P0-6: опц. локальный URI картинки для отправки. Mutation сама загружает
   * её в Storage bucket 'chat-images', получает public URL и сохраняет в
   * messages.image_url. Принимаем data:URL, blob:URL, content://, file:// —
   * всё что Image picker возвращает на разных платформах.
   */
  imageUri?: string | null;
}

/**
 * Загружает картинку в Storage bucket chat-images по пути
 * {senderId}/{chatId}/{timestamp}.jpg (RLS-policy требует первый сегмент = uid).
 * Возвращает public URL.
 */
async function uploadChatImage(
  imageUri: string,
  senderId: string,
  chatId: string,
): Promise<string> {
  // Конвертируем URI в Blob для upload (работает в Web и в RN через fetch).
  const res = await fetch(imageUri);
  const blob = await res.blob();
  const ext = blob.type.includes("png")
    ? "png"
    : blob.type.includes("webp")
      ? "webp"
      : blob.type.includes("heic")
        ? "heic"
        : "jpg";
  const path = `${senderId}/${chatId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("chat-images")
    .upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("chat-images").getPublicUrl(path);
  return pub.publicUrl;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, senderId, text, imageUri }: SendMessageInput) => {
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadChatImage(imageUri, senderId, chatId);
      }
      // CHECK constraint в БД: должен быть text или image_url. Если текст
      // пустой и фото есть — отправляем text=null.
      const trimmed = text.trim();
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: senderId,
        text: trimmed.length > 0 ? trimmed : null,
        image_url: imageUrl,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { chatId, senderId }) => {
      // Realtime сам прокинет в кэш chat-messages, но для надёжности:
      queryClient.invalidateQueries({ queryKey: chatMessagesKey(chatId) });
      queryClient.invalidateQueries({ queryKey: myChatsKey(senderId) });
    },
  });
}
