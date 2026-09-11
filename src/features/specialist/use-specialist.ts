/**
 * Профиль специалиста — данные и мутации для «Я специалист».
 *
 * DECISION владельца 2026-09-07: «человек на своём аккаунте отмечает, чем
 * занимается (категории), пишет о себе, делится фото работ, оставляет
 * контакты (WhatsApp) — и всё. Дальше — отзывы». Здесь только это.
 * Видимость в каталоге считает сервер (try_publish_master, 0169): достаточно
 * одной категории.
 */

import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  | "hidden_by_owner"
  | "whatsapp_phone"
  | "whatsapp_same_as_phone"
  | "rating_overall_avg"
  | "rating_overall_count"
  | "link_url"
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
          "user_id, bio, experience_years, status, is_hidden_from_search, hidden_by_owner, whatsapp_phone, whatsapp_same_as_phone, rating_overall_avg, rating_overall_count, link_url",
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
    {
      userId: string;
      contactPhone: string;
      whatsappPhone: string;
      whatsappSameAsPhone: boolean;
      /** Соцсеть или сайт (0188); null — убрать. Не передано — не трогать. */
      linkUrl?: string | null;
    }
  >({
    mutationFn: async ({ userId, contactPhone, whatsappPhone, whatsappSameAsPhone, linkUrl }) => {
      // Один вызов — оба поля в одной транзакции (0173).
      const { error } = await supabase.rpc("set_specialist_contacts", {
        p_phone: contactPhone,
        p_whatsapp: whatsappPhone,
        p_same: whatsappSameAsPhone,
      });
      if (error) throw error;
      // Ссылка — отдельной колонкой, а не параметром функции выше: старые
      // сборки зовут её с тремя параметрами и затирали бы ссылку (0188).
      if (linkUrl !== undefined) {
        const res = await supabase
          .from("master_profiles")
          .update({ link_url: linkUrl })
          .eq("user_id", userId);
        if (res.error) throw res.error;
      }
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

/**
 * Галочка «Показывать меня среди специалистов» (0176, DECISION владельца
 * 2026-09-08). Оптимистично: переключатель меняется сразу, сервер подтверждает.
 */
export function useSetShownInCatalog(userId: string | undefined) {
  const qc = useQueryClient();
  const key: QueryKey = specialistKey(userId);
  return useMutation<void, Error, boolean, { previous: SpecialistProfile | null | undefined }>({
    mutationFn: async (shown: boolean) => {
      if (!userId) throw new Error("Нужно войти в аккаунт");
      const { error } = await supabase
        .from("master_profiles")
        .update({ hidden_by_owner: !shown })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async (shown) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SpecialistProfile | null>(key);
      if (previous)
        qc.setQueryData<SpecialistProfile>(key, { ...previous, hidden_by_owner: !shown });
      return { previous };
    },
    onError: (_e, _shown, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous ?? null);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["search-masters"] });
      qc.invalidateQueries({ queryKey: ["master-public", userId] });
    },
  });
}
