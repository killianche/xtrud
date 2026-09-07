/**
 * Подтверждение паспорта специалиста (0070 + 0174).
 *
 * Человек отправляет одно фото главного разворота паспорта. Файл лежит в
 * приватном бакете master-verifications в папке {user_id}/ — читают его
 * только владелец и администратор. Строка master_verifications хранит статус:
 * pending → approved | rejected (с причиной). При approved триггер ставит
 * master_profiles.verification_level = 2 — по нему рисуется значок.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DOCUMENT_PRESET,
  deleteFromBucket,
  pickImage,
  resizeImage,
  uploadImage,
} from "@/lib/image-upload";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type MyVerification = Tables<"master_verifications">;

export const verificationKey = (userId: string | undefined) => ["my-verification", userId] as const;

export function useMyVerification(userId: string | undefined) {
  return useQuery<MyVerification | null>({
    queryKey: verificationKey(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_verifications")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export const VERIFICATION_LABEL: Record<MyVerification["status"] | "none", string> = {
  // DECISION владельца 2026-09-07: подтверждение — по желанию, не обязательно.
  none: "По желанию",
  pending: "На проверке",
  approved: "Подтверждена",
  rejected: "Отклонена",
};

/** Выбрать фото, загрузить и отправить (или заново отправить) заявку. */
export function useSubmitVerification(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<"cancelled" | "sent", Error, { previous: MyVerification | null }>({
    mutationFn: async ({ previous }) => {
      if (!userId) throw new Error("Нужно войти в аккаунт");
      const picked = await pickImage({ title: "Паспорт" });
      if (!picked) return "cancelled";
      const resized = await resizeImage(picked, DOCUMENT_PRESET);
      const path = `${userId}/passport-${Date.now()}.${DOCUMENT_PRESET.extension}`;
      await uploadImage({
        bucket: "master-verifications",
        path,
        localUri: resized.uri,
        contentType: DOCUMENT_PRESET.contentType,
        upsert: false,
      });
      if (previous) {
        const { error } = await supabase
          .from("master_verifications")
          .update({
            status: "pending",
            passport_main_path: path,
            submitted_at: new Date().toISOString(),
            reviewed_at: null,
            reviewed_by: null,
            rejection_reason: null,
          })
          .eq("user_id", userId);
        if (error) throw error;
        // Старое фото больше не нужно; ошибка удаления не мешает заявке.
        if (previous.passport_main_path !== path) {
          await deleteFromBucket({
            bucket: "master-verifications",
            path: previous.passport_main_path,
          }).catch(() => undefined);
        }
      } else {
        const { error } = await supabase
          .from("master_verifications")
          .insert({ user_id: userId, passport_main_path: path, status: "pending" });
        if (error) throw error;
      }
      return "sent";
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: verificationKey(userId) });
    },
  });
}
