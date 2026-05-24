// Mutation: сохранить данные master-профиля на шаге 1/3 онбординга (имя/опыт/whatsapp).
//
// Sprint 2026-05-20 — reorder шагов: profile стал ПЕРВЫМ (раньше был последним),
// photo — последним. Поэтому НЕ вызываем complete_master_onboarding (он бы
// сразу установил onboarding_completed_at=now() и AuthGate улетел бы в /tabs
// мимо categories/photo). Финализация — на последнем шаге через
// finalize_master_onboarding() RPC из app/(onboarding)/master-photo.tsx.
//
// Что делаем тут:
//   UPDATE users SET first_name, last_name, district (через client + RLS).
//   UPSERT master_profiles { bio, experience_years, whatsapp_*, status='pending' }.
//   onboarding_completed_at и is_master НЕ трогаем.
//
// Race-condition / атомарность: на этом шаге две операции (users + master_profiles).
// Если master_profiles упадёт после успешного users.update — данные слегка
// рассинхрон, но AuthGate всё ещё держит юзера в onboarding (нет
// onboarding_completed_at) → следующая попытка просто переUPSERTит.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export interface SubmitMasterProfileInput {
  userId: string;
  firstName: string;
  lastName: string;
  /** Сохранено в схеме, но в текущей форме онбординга не используется. */
  cityId: string;
  district: string;
  bio: string;
  experienceYears: number;
  whatsappSameAsPhone: boolean;
  /** Пустая строка = не указан. Игнорируется если whatsappSameAsPhone=true. */
  whatsappPhone: string;
  // Sprint 2026-05-20 (миграция 0097): contact_phone — публичный контактный
  // номер для клиентов. Если same=true → пишем NULL; на чтении делаем COALESCE
  // с users_private.phone (см. get_master_phone RPC).
  contactSameAsPhone: boolean;
  contactPhone: string;
}

export function useSubmitMasterProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitMasterProfileInput) => {
      // 1. UPDATE users — first_name / last_name / district / contact_phone
      //    через client + RLS. city_id оставляем как есть (form не редактирует,
      //    мастер укажет зоны работы позже через master_service_areas в
      //    /profile/edit-master).
      //
      //    contact_phone:
      //      contactSameAsPhone=true → NULL → читается через
      //        COALESCE(users.contact_phone, users_private.phone) в get_master_phone RPC.
      //      contactSameAsPhone=false → trimmed value (или NULL если пусто).
      const trimmedContact = input.contactPhone.trim();
      const finalContactPhone = input.contactSameAsPhone
        ? null
        : trimmedContact === ""
          ? null
          : trimmedContact;

      const { error: userErr } = await supabase
        .from("users")
        .update({
          first_name: input.firstName,
          last_name: input.lastName,
          district: input.district.trim() === "" ? null : input.district.trim(),
          // contact_phone — миграция 0097, типы регенерятся следующим
          // generate_typescript_types. Каст until then.
          contact_phone: finalContactPhone,
        } as never)
        .eq("id", input.userId);
      if (userErr) throw userErr;

      // 2. UPSERT master_profiles — bio / experience_years / whatsapp / status.
      //    constraint master_profiles_whatsapp_xor: same=true ⟹ phone NULL.
      const trimmedWa = input.whatsappPhone.trim();
      const whatsappPhone =
        input.whatsappSameAsPhone || trimmedWa === "" ? null : trimmedWa;

      const { error: profileErr } = await supabase
        .from("master_profiles")
        .upsert(
          {
            user_id: input.userId,
            bio: input.bio.trim() === "" ? null : input.bio.trim(),
            experience_years: input.experienceYears,
            has_tools: false,
            has_transport: false,
            status: "pending",
            whatsapp_same_as_phone: input.whatsappSameAsPhone,
            whatsapp_phone: whatsappPhone,
          },
          { onConflict: "user_id" },
        );
      if (profileErr) throw profileErr;
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
      queryClient.invalidateQueries({ queryKey: ["master-public", userId] });
    },
  });
}
