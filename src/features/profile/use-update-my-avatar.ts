// Полный pipeline аватара: pick → upload → UPDATE users.avatar_url → invalidate.
//
// Отдельно от useUploadAvatar (storage-only) — этот hook знает про доменное поле
// и инвалидирует кэш userRecord, чтобы Header / Avatar показали свежее фото.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { pickResizeUploadAvatar } from "@/lib/image-upload";
import { supabase } from "@/lib/supabase";

export function useUpdateMyAvatar(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<string | null, Error>({
    mutationFn: async () => {
      if (!userId) throw new Error("Не авторизованы");

      const uploaded = await pickResizeUploadAvatar(userId);
      if (!uploaded) return null; // отмена

      const { error } = await supabase
        .from("users")
        .update({ avatar_url: uploaded.publicUrl })
        .eq("id", userId);
      if (error) throw error;

      return uploaded.publicUrl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userRecordKey(userId ?? undefined) });
    },
  });
}

export function useRemoveMyAvatar(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      if (!userId) throw new Error("Не авторизованы");

      const { error } = await supabase.from("users").update({ avatar_url: null }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userRecordKey(userId ?? undefined) });
    },
  });
}
