/**
 * Профиль специалиста — данные и мутации для «Я специалист».
 *
 * DECISION владельца 2026-09-07: «человек на своём аккаунте отмечает, чем
 * занимается (категории), пишет о себе, делится фото работ, оставляет
 * контакты (WhatsApp) — и всё. Дальше — отзывы». Здесь только это.
 * Видимость в каталоге считает сервер (try_publish_master, 0169): достаточно
 * одной категории.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { myCategoriesKey } from "@/features/master-categories/use-my-categories";
import { portfolioKey } from "@/features/profile/use-my-portfolio";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export const specialistKey = (userId: string | undefined) => ["specialist", userId] as const;

export type SpecialistProfile = Pick<
  Tables<"master_profiles">,
  | "user_id"
  | "bio"
  | "experience_years"
  | "status"
  | "is_hidden_from_search"
  | "whatsapp_phone"
  | "rating_overall_avg"
  | "rating_overall_count"
>;

/** Моя запись master_profiles; null — режим специалиста не включён. */
export function useMySpecialistProfile(userId: string | undefined) {
  return useQuery<SpecialistProfile | null>({
    queryKey: specialistKey(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_profiles")
        .select(
          "user_id, bio, experience_years, status, is_hidden_from_search, whatsapp_phone, rating_overall_avg, rating_overall_count",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

function useInvalidateSpecialist() {
  const qc = useQueryClient();
  return (userId: string) => {
    qc.invalidateQueries({ queryKey: specialistKey(userId) });
    qc.invalidateQueries({ queryKey: userRecordKey(userId) });
    qc.invalidateQueries({ queryKey: ["master-profile", userId] });
    qc.invalidateQueries({ queryKey: ["master-public", userId] });
  };
}

/** Включить режим специалиста: RPC создаёт master_profiles (pending) и
 *  ставит is_master. Видимым профиль станет после первой категории. */
export function useEnableSpecialistMode() {
  const invalidate = useInvalidateSpecialist();
  return useMutation<void, Error, { userId: string }>({
    mutationFn: async () => {
      const { error } = await supabase.rpc("enable_master_mode");
      if (error) throw error;
    },
    onSuccess: (_d, { userId }) => invalidate(userId),
  });
}

export function useUpdateSpecialistAbout() {
  const invalidate = useInvalidateSpecialist();
  return useMutation<void, Error, { userId: string; bio: string; experienceYears: number | null }>({
    mutationFn: async ({ userId, bio, experienceYears }) => {
      const { error } = await supabase
        .from("master_profiles")
        .update({ bio: bio.trim() || null, experience_years: experienceYears })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, { userId }) => invalidate(userId),
  });
}

export function useUpdateSpecialistContacts() {
  const invalidate = useInvalidateSpecialist();
  return useMutation<
    void,
    Error,
    { userId: string; contactPhone: string; whatsappPhone: string; whatsappSameAsPhone: boolean }
  >({
    mutationFn: async ({ userId, contactPhone, whatsappPhone, whatsappSameAsPhone }) => {
      const { error: usersErr } = await supabase
        .from("users")
        .update({ contact_phone: contactPhone.trim() || null })
        .eq("id", userId);
      if (usersErr) throw usersErr;
      // Ограничение master_profiles_whatsapp_xor: «тот же номер» — без
      // отдельного whatsapp_phone; отдельный номер — флаг false.
      const wa = whatsappSameAsPhone ? "" : whatsappPhone.trim();
      const { error } = await supabase
        .from("master_profiles")
        .update({ whatsapp_phone: wa || null, whatsapp_same_as_phone: whatsappSameAsPhone })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, { userId }) => invalidate(userId),
  });
}

/** Ключи, которые надо обновить после смены категорий/фото (для хаба). */
export function useInvalidateSpecialistCounts() {
  const qc = useQueryClient();
  return (userId: string) => {
    qc.invalidateQueries({ queryKey: myCategoriesKey(userId) });
    qc.invalidateQueries({ queryKey: portfolioKey(userId) });
    qc.invalidateQueries({ queryKey: specialistKey(userId) });
  };
}
